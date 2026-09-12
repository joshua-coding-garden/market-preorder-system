import type { Prisma } from '@prisma/client'
import { AppError } from './errors.js'
import { dateToIsoDate, taipeiToUtc } from './time.js'

/**
 * 邀請碼（D-03、04 §C）
 *   格式：{market.code}{YYYYMMDD}-{4 位流水號}，例 A20260912-0001
 *   expires_at    = event_date 當天 23:59:59 台北 → UTC
 *   recyclable_at = expires_at + 60 天
 *   流水號 = 該場次「尚未回收」的最大流水號 + 1，從 0001 起
 *            （回收後字串可重新配發，所以 RECYCLED 不計入）
 */

export const INVITE_RECYCLE_DAYS = 60
const MAX_SEQ_RETRY = 20

export function buildInviteCode(
  marketCode: string,
  eventDate: Date,
  seq: number,
): string {
  const datePart = dateToIsoDate(eventDate).replaceAll('-', '')
  return `${marketCode}${datePart}-${String(seq).padStart(4, '0')}`
}

export function inviteExpiresAt(eventDate: Date): Date {
  return taipeiToUtc(dateToIsoDate(eventDate), '23:59:59')
}

export function inviteRecyclableAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() + INVITE_RECYCLE_DAYS * 24 * 60 * 60 * 1000)
}

/** 從 code 取出流水號；格式不符回 0 */
export function seqOf(code: string): number {
  const m = /-(\d{4})$/.exec(code)
  return m ? Number(m[1]) : 0
}

/**
 * 為一個 participation 發一張新的 ACTIVE 邀請碼。
 * 必須在交易內呼叫（呼叫端要先把該 participation 既有的 ACTIVE 碼改掉，
 * 否則會撞 uq_invite_code_active）。
 */
export async function issueInviteCode(
  tx: Prisma.TransactionClient,
  participationId: string,
) {
  const participation = await tx.participation.findUnique({
    where: { id: participationId },
    include: { marketDay: { include: { market: true } } },
  })
  if (!participation) throw new AppError('NOT_FOUND', '找不到參與資料')

  const { marketDay } = participation
  const expiresAt = inviteExpiresAt(marketDay.eventDate)
  const recyclableAt = inviteRecyclableAt(expiresAt)

  // 該場次所有尚未回收的碼，用來決定下一個流水號
  const existing = await tx.inviteCode.findMany({
    where: {
      participation: { marketDayId: marketDay.id },
      status: { not: 'RECYCLED' },
    },
    select: { code: true },
  })
  let seq = existing.reduce((max, c) => Math.max(max, seqOf(c.code)), 0) + 1

  // uq_invite_code_live 撞到就 seq+1 重試（理論上只在同日重建場次時發生）
  for (let attempt = 0; attempt < MAX_SEQ_RETRY; attempt += 1) {
    const code = buildInviteCode(marketDay.market.code, marketDay.eventDate, seq)
    try {
      return await tx.inviteCode.create({
        data: { participationId, code, expiresAt, recyclableAt },
      })
    } catch (err) {
      if (isUniqueViolation(err, 'code')) {
        seq += 1
        continue
      }
      throw err
    }
  }
  throw new AppError('CONFLICT', '邀請碼流水號配發失敗，請稍後再試')
}

/** Prisma 的 unique violation（P2002）；可指定欄位 */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } }
  if (e?.code !== 'P2002') return false
  if (!field) return true
  const target = e.meta?.target
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '')
  return text.includes(field)
}
