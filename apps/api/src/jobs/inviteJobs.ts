import { prisma } from '../lib/db.js'

/**
 * 邀請碼排程（04 §C／§G）。兩個 job 都是冪等的，重跑不會有副作用。
 * 匯出成純函式，測試可直接呼叫（S1-8、S1-9）。
 */

/** ACTIVE 且 now() > expires_at → EXPIRED（每小時） */
export async function inviteExpire(now: Date = new Date()): Promise<{ expired: number }> {
  const result = await prisma.inviteCode.updateMany({
    where: { status: 'ACTIVE', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  })
  return { expired: result.count }
}

/** EXPIRED／REDEEMED 且 now() > recyclable_at → RECYCLED（每天 03:00 台北） */
export async function inviteRecycle(now: Date = new Date()): Promise<{ recycled: number }> {
  const result = await prisma.inviteCode.updateMany({
    where: {
      status: { in: ['EXPIRED', 'REDEEMED'] },
      recyclableAt: { lt: now },
    },
    data: { status: 'RECYCLED' },
  })
  return { recycled: result.count }
}
