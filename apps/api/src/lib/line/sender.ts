import type { NotificationKind } from '@market/shared'
import { config } from '../../config.js'
import { prisma } from '../db.js'
import { AppError } from '../errors.js'
import { GOOGLE_USER_PREFIX } from '../googleLogin.js'
import { LOCAL_USER_PREFIX } from '../localAuth.js'
import { MULTICAST_BATCH_SIZE, getLineClient, type LineMessage } from './client.js'

/**
 * 所有 LINE 訊息的唯一出口（04 §E、B-11）。
 *
 * 流程：
 *   1. estimate = 收件人數 × 訊息則數
 *   2. used  = LINE quota consumption（取不到時 fallback 本地統計 Q5）
 *      limit = LINE quota（type=none 時用 env LINE_MONTHLY_MESSAGE_QUOTA）
 *   3. used + estimate > limit → 每個收件人寫 SKIPPED_QUOTA，throw QUOTA_EXCEEDED
 *   4. 依人數選 push／multicast（500 一批）／broadcast
 *   5. 每個收件人寫 notification（SENT／FAILED）
 *
 * **超過額度一律阻擋並記錄，不得靜默送出。**
 */

export interface SendTarget {
  /** app_user.id；broadcast 時為 null */
  userId: string | null
  lineUserId: string
}

export interface SendOptions {
  kind: NotificationKind
  /** sub_order.id / preorder.id / broadcast.id */
  refId?: string | null
  targets: SendTarget[]
  messages: LineMessage[]
  /** ALL_FRIENDS 時改用 broadcast API，targets 只用來估算人數 */
  useBroadcast?: boolean
}

export interface SendResult {
  sent: number
  failed: number
  skipped: number
}

/** Q5：本月已送則數（本地統計，作為 LINE API 取不到時的備援） */
export async function localMonthlyUsage(now: Date = new Date()): Promise<number> {
  // 以台北時區的月初為界
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const startTaipei = Date.UTC(taipei.getUTCFullYear(), taipei.getUTCMonth(), 1)
  const startUtc = new Date(startTaipei - 8 * 60 * 60 * 1000)

  const agg = await prisma.notification.aggregate({
    where: { status: 'SENT', createdAt: { gte: startUtc } },
    _sum: { messageCount: true },
  })
  return agg._sum.messageCount ?? 0
}

export interface QuotaSnapshot {
  used: number
  limit: number
  estimate: number
  allowed: boolean
}

/** 額度估算；`send` 與 `/operator/broadcasts/:id/estimate` 共用 */
export async function estimateQuota(
  recipientCount: number,
  messageCount = 1,
): Promise<QuotaSnapshot> {
  const client = getLineClient()
  const estimate = recipientCount * messageCount

  const remoteUsed = await client.getConsumption()
  const used = remoteUsed ?? (await localMonthlyUsage())

  const remoteLimit = await client.getQuota()
  const limit = remoteLimit ?? config.LINE_MONTHLY_MESSAGE_QUOTA

  return { used, limit, estimate, allowed: used + estimate <= limit }
}

/** Google／帳密的暫時帳號收不到 LINE 推播（規格外的登入通道造成，見 NOTES） */
function isPushable(lineUserId: string): boolean {
  return (
    Boolean(lineUserId) &&
    !lineUserId.startsWith(GOOGLE_USER_PREFIX) &&
    !lineUserId.startsWith(LOCAL_USER_PREFIX)
  )
}

export async function send(options: SendOptions): Promise<SendResult> {
  const { kind, refId = null, targets, messages, useBroadcast = false } = options
  const client = getLineClient()

  if (targets.length === 0) return { sent: 0, failed: 0, skipped: 0 }

  const quota = await estimateQuota(targets.length, messages.length)

  // 3. 超過額度：全部記 SKIPPED_QUOTA 並中止，不呼叫任何 LINE API
  if (!quota.allowed) {
    await prisma.notification.createMany({
      data: targets.map((t) => ({
        kind,
        refId,
        userId: t.userId,
        lineUserId: t.lineUserId,
        messageCount: messages.length,
        status: 'SKIPPED_QUOTA' as const,
        error: `額度不足：已用 ${quota.used}／${quota.limit}，本次需 ${quota.estimate}`,
      })),
    })
    throw new AppError('QUOTA_EXCEEDED', '本月訊息額度不足，無法送出')
  }

  const pushable = targets.filter((t) => isPushable(t.lineUserId))
  const unpushable = targets.filter((t) => !isPushable(t.lineUserId))

  let sent = 0
  let failed = 0
  const now = new Date()

  // 收不到推播的帳號直接記 FAILED，不浪費額度
  if (unpushable.length > 0) {
    await prisma.notification.createMany({
      data: unpushable.map((t) => ({
        kind,
        refId,
        userId: t.userId,
        lineUserId: t.lineUserId,
        messageCount: messages.length,
        status: 'FAILED' as const,
        error: '此帳號不是 LINE 使用者，無法接收推播',
      })),
    })
    failed += unpushable.length
  }

  const markSent = async (batch: SendTarget[]) => {
    await prisma.notification.createMany({
      data: batch.map((t) => ({
        kind,
        refId,
        userId: t.userId,
        lineUserId: t.lineUserId,
        messageCount: messages.length,
        status: 'SENT' as const,
        sentAt: now,
      })),
    })
    sent += batch.length
  }

  const markFailed = async (batch: SendTarget[], err: unknown) => {
    const message = err instanceof Error ? err.message : '送出失敗'
    await prisma.notification.createMany({
      data: batch.map((t) => ({
        kind,
        refId,
        userId: t.userId,
        lineUserId: t.lineUserId,
        messageCount: messages.length,
        status: 'FAILED' as const,
        error: message.slice(0, 500),
      })),
    })
    failed += batch.length
  }

  // 4. 依 kind 與人數選 API
  if (useBroadcast) {
    try {
      await client.broadcast(messages)
      await markSent(pushable)
    } catch (err) {
      await markFailed(pushable, err)
    }
    return { sent, failed, skipped: 0 }
  }

  if (pushable.length === 1) {
    const [only] = pushable
    try {
      await client.push(only.lineUserId, messages)
      await markSent([only])
    } catch (err) {
      await markFailed([only], err)
    }
    return { sent, failed, skipped: 0 }
  }

  for (let i = 0; i < pushable.length; i += MULTICAST_BATCH_SIZE) {
    const batch = pushable.slice(i, i + MULTICAST_BATCH_SIZE)
    try {
      await client.multicast(
        batch.map((t) => t.lineUserId),
        messages,
      )
      await markSent(batch)
    } catch (err) {
      await markFailed(batch, err)
    }
  }

  return { sent, failed, skipped: 0 }
}

/** ALL_FRIENDS 的人數估算（04 §E）：好友數取不到時用 app_user 總數當保守值 */
export async function estimateAllFriends(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const date = `${yesterday.getUTCFullYear()}${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}${String(yesterday.getUTCDate()).padStart(2, '0')}`

  const followers = await getLineClient().getFollowerCount(date)
  if (followers !== null) return followers
  return prisma.appUser.count()
}
