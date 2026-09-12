import type {
  Audience,
  BroadcastStatus,
  CreateBroadcastInput,
  UpdateBroadcastInput,
} from '@market/shared'
import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'
import { broadcastMessage } from '../../lib/line/messages.js'
import { estimateAllFriends, estimateQuota, send, type SendTarget } from '../../lib/line/sender.js'
import { dateToIsoDate } from '../../lib/time.js'

/**
 * 推播申請與審核（03 §10、04 §E 推播段、D-09）。
 *
 * 狀態機：
 *   STALL_COMPOSE    建立 → PENDING_REVIEW → approve → APPROVED → send → SENT/FAILED
 *                                          → reject  → REJECTED
 *   OPERATOR_COMPOSE 建立 → DRAFT → operator 編輯完 approve → APPROVED → send
 *   廠商自發          建立 → APPROVED → send
 * SENT／FAILED 為終態；要重發就建新的。
 */

function serialize(b: {
  id: string
  marketDayId: string | null
  stallId: string | null
  composeMode: string
  title: string
  bodyText: string
  imageUrl: string | null
  audience: string
  status: string
  rejectReason: string | null
  reviewedAt: Date | null
  sentAt: Date | null
  recipientCount: number | null
  error: string | null
  createdAt: Date
  stall?: { id: string; name: string } | null
  marketDay?: { id: string; eventDate: Date } | null
  requestedBy?: { id: string; displayName: string } | null
}) {
  return {
    id: b.id,
    marketDayId: b.marketDayId,
    marketDay: b.marketDay
      ? { id: b.marketDay.id, eventDate: dateToIsoDate(b.marketDay.eventDate) }
      : null,
    stallId: b.stallId,
    stall: b.stall ?? null,
    requestedBy: b.requestedBy ?? null,
    composeMode: b.composeMode,
    title: b.title,
    bodyText: b.bodyText,
    imageUrl: b.imageUrl,
    audience: b.audience,
    status: b.status,
    rejectReason: b.rejectReason,
    reviewedAt: b.reviewedAt?.toISOString() ?? null,
    sentAt: b.sentAt?.toISOString() ?? null,
    recipientCount: b.recipientCount,
    error: b.error,
    createdAt: b.createdAt.toISOString(),
  }
}

const INCLUDE = {
  stall: { select: { id: true, name: true } },
  marketDay: { select: { id: true, eventDate: true } },
  requestedBy: { select: { id: true, displayName: true } },
} as const

// ---------------------------------------------------------------- 攤商端

/**
 * 攤商申請（03 §10）：
 *   STALL_COMPOSE   自寫文案，必填 title/bodyText，直接進 PENDING_REVIEW
 *   OPERATOR_COMPOSE 請廠商代寫，建成 DRAFT
 */
export async function createStallBroadcast(
  stallId: string,
  userId: string,
  input: CreateBroadcastInput,
) {
  if (input.composeMode === 'STALL_COMPOSE') {
    if (!input.title?.trim() || !input.bodyText?.trim()) {
      throw new AppError('VALIDATION', '自寫文案時標題與內容都必填')
    }
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      stallId,
      marketDayId: input.marketDayId ?? null,
      requestedByUserId: userId,
      composeMode: input.composeMode,
      title: input.title ?? '',
      bodyText: input.bodyText ?? '',
      imageUrl: input.imageUrl ?? null,
      audience: (input.audience ?? 'STALL_CUSTOMERS') as Audience,
      status: input.composeMode === 'STALL_COMPOSE' ? 'PENDING_REVIEW' : 'DRAFT',
    },
    include: INCLUDE,
  })
  return serialize(broadcast)
}

export async function listStallBroadcasts(stallId: string) {
  const rows = await prisma.broadcast.findMany({
    where: { stallId },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(serialize)
}

/** 取自己攤位的推播；別攤的當作不存在 */
export async function getStallBroadcast(stallId: string, id: string) {
  const b = await prisma.broadcast.findFirst({ where: { id, stallId }, include: INCLUDE })
  if (!b) throw new AppError('FORBIDDEN', '沒有權限')
  return b
}

// ---------------------------------------------------------------- 廠商端

export async function listOperatorBroadcasts(status?: BroadcastStatus) {
  const rows = await prisma.broadcast.findMany({
    where: status ? { status } : {},
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(serialize)
}

export async function getOperatorBroadcast(id: string) {
  const b = await prisma.broadcast.findUnique({ where: { id }, include: INCLUDE })
  if (!b) throw notFound('找不到推播')
  return serialize(b)
}

/** 廠商自發：直接 APPROVED */
export async function createOperatorBroadcast(userId: string, input: CreateBroadcastInput) {
  if (!input.bodyText?.trim()) {
    throw new AppError('VALIDATION', '推播內容必填')
  }
  const broadcast = await prisma.broadcast.create({
    data: {
      marketDayId: input.marketDayId ?? null,
      requestedByUserId: userId,
      composeMode: 'OPERATOR_COMPOSE',
      title: input.title ?? '',
      bodyText: input.bodyText,
      imageUrl: input.imageUrl ?? null,
      audience: (input.audience ?? 'ALL_FRIENDS') as Audience,
      status: 'APPROVED',
      reviewedByUserId: userId,
      reviewedAt: new Date(),
    },
    include: INCLUDE,
  })
  return serialize(broadcast)
}

/** 可編輯的狀態：DRAFT／PENDING_REVIEW／APPROVED */
const EDITABLE: BroadcastStatus[] = ['DRAFT', 'PENDING_REVIEW', 'APPROVED']

export async function updateBroadcast(id: string, input: UpdateBroadcastInput) {
  const existing = await prisma.broadcast.findUnique({ where: { id } })
  if (!existing) throw notFound('找不到推播')
  if (!EDITABLE.includes(existing.status as BroadcastStatus)) {
    throw new AppError('INVALID_STATE_TRANSITION', '這個狀態的推播不能再編輯')
  }

  const broadcast = await prisma.broadcast.update({
    where: { id },
    data: {
      ...(input.marketDayId !== undefined ? { marketDayId: input.marketDayId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.audience !== undefined ? { audience: input.audience as Audience } : {}),
    },
    include: INCLUDE,
  })
  return serialize(broadcast)
}

export async function approveBroadcast(id: string, userId: string) {
  const existing = await prisma.broadcast.findUnique({ where: { id } })
  if (!existing) throw notFound('找不到推播')
  if (existing.status !== 'PENDING_REVIEW' && existing.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有待審核或草稿可以核准')
  }
  if (!existing.bodyText.trim()) {
    throw new AppError('VALIDATION', '推播內容是空的，不能核准')
  }

  const broadcast = await prisma.broadcast.update({
    where: { id },
    data: { status: 'APPROVED', reviewedByUserId: userId, reviewedAt: new Date() },
    include: INCLUDE,
  })
  return serialize(broadcast)
}

export async function rejectBroadcast(id: string, userId: string, reason: string) {
  const existing = await prisma.broadcast.findUnique({ where: { id } })
  if (!existing) throw notFound('找不到推播')
  if (existing.status !== 'PENDING_REVIEW') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有待審核的推播可以退回')
  }

  const broadcast = await prisma.broadcast.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedByUserId: userId,
      reviewedAt: new Date(),
      rejectReason: reason,
    },
    include: INCLUDE,
  })
  return serialize(broadcast)
}

// ---------------------------------------------------------------- 收件人與估算

/** 依 audience 取收件人（D-09） */
async function resolveTargets(b: {
  audience: string
  marketDayId: string | null
  stallId: string | null
}): Promise<SendTarget[]> {
  if (b.audience === 'ALL_FRIENDS') {
    // broadcast API 不需要名單，但仍要估人數才能算額度
    const count = await estimateAllFriends()
    return Array.from({ length: count }, () => ({ userId: null, lineUserId: '' }))
  }

  if (!b.marketDayId) {
    throw new AppError('VALIDATION', '這個對象需要指定場次')
  }

  const where =
    b.audience === 'STALL_CUSTOMERS'
      ? {
          marketDayId: b.marketDayId,
          subOrders: b.stallId ? { some: { stallId: b.stallId } } : undefined,
        }
      : { marketDayId: b.marketDayId }

  if (b.audience === 'STALL_CUSTOMERS' && !b.stallId) {
    throw new AppError('VALIDATION', '這個對象需要指定攤商')
  }

  const preorders = await prisma.preorder.findMany({
    where,
    select: { user: { select: { id: true, lineUserId: true } } },
    distinct: ['userId'],
  })

  return preorders.map((p) => ({ userId: p.user.id, lineUserId: p.user.lineUserId }))
}

/** GET /operator/broadcasts/:id/estimate */
export async function estimateBroadcast(id: string) {
  const b = await prisma.broadcast.findUnique({ where: { id } })
  if (!b) throw notFound('找不到推播')

  const targets = await resolveTargets(b)
  const messageCount = broadcastMessage({
    title: b.title,
    bodyText: b.bodyText,
    imageUrl: b.imageUrl,
  }).length

  // ALL_FRIENDS 用 broadcast API，只算一則 × 人數
  const quota = await estimateQuota(targets.length, messageCount)

  return {
    recipients: targets.length,
    monthUsed: quota.used,
    monthQuota: quota.limit,
    estimate: quota.estimate,
    allowed: quota.allowed,
  }
}

/** POST /operator/broadcasts/:id/send */
export async function sendBroadcast(id: string) {
  const b = await prisma.broadcast.findUnique({ where: { id } })
  if (!b) throw notFound('找不到推播')
  if (b.status !== 'APPROVED') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有已核准的推播可以送出')
  }

  // send 前必呼叫 estimate（04 §E）
  const estimate = await estimateBroadcast(id)
  if (!estimate.allowed) {
    // 狀態維持 APPROVED，讓廠商下個月或調整對象後再送
    throw new AppError('QUOTA_EXCEEDED', '本月訊息額度不足，無法送出')
  }

  const targets = await resolveTargets(b)
  const messages = broadcastMessage({
    title: b.title,
    bodyText: b.bodyText,
    imageUrl: b.imageUrl,
  })

  try {
    const result = await send({
      kind: 'BROADCAST',
      refId: id,
      targets,
      messages,
      useBroadcast: b.audience === 'ALL_FRIENDS',
    })

    const failedAll = result.sent === 0 && result.failed > 0
    const updated = await prisma.broadcast.update({
      where: { id },
      data: {
        status: failedAll ? 'FAILED' : 'SENT',
        sentAt: new Date(),
        recipientCount: result.sent,
        error: failedAll ? '全部收件人送出失敗' : null,
      },
      include: INCLUDE,
    })
    return serialize(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : '送出失敗'
    if (err instanceof AppError && err.code === 'QUOTA_EXCEEDED') {
      // sender 已寫 SKIPPED_QUOTA；狀態不變，讓廠商可以之後再送
      throw err
    }
    await prisma.broadcast.update({
      where: { id },
      data: { status: 'FAILED', error: message.slice(0, 500) },
    })
    throw err
  }
}

/** O1 儀表板用的本月額度（§10 沒有列這支，見 NOTES 的規格缺口說明） */
export async function monthlyQuota() {
  const quota = await estimateQuota(0, 0)
  const pendingReview = await prisma.broadcast.count({ where: { status: 'PENDING_REVIEW' } })
  return { monthUsed: quota.used, monthQuota: quota.limit, pendingReview }
}
