import type { FastifyRequest } from 'fastify'
import { prisma } from '../lib/db.js'
import { forbidden, unauthenticated } from '../lib/errors.js'

/**
 * 權限檢查的唯一來源（04 §H）。
 *
 * B-1：角色與攤商身分只能來自後端 —— 一律用 session 的 userId 重新查資料庫，
 *      不從 body／query／header 讀取 role 或 stallId 身分。
 * B-2：每支受保護的 route，第一行 requireAuth，第二行對應的 assert*。
 */

/** 無 session → 401 */
export function requireAuth(req: FastifyRequest): string {
  if (!req.sessionUserId) throw unauthenticated()
  return req.sessionUserId
}

/** role !== 'operator' → 403 */
export async function assertOperator(userId: string): Promise<void> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (!user || user.role !== 'operator') throw forbidden()
}

export async function isOperator(userId: string): Promise<boolean> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return user?.role === 'operator'
}

/** operator 直接通過；否則查 stall_member，無 → 403 */
export async function assertStallMember(userId: string, stallId: string): Promise<void> {
  if (await isOperator(userId)) return
  const member = await prisma.stallMember.findUnique({
    where: { userId_stallId: { userId, stallId } },
    select: { stallId: true },
  })
  if (!member) throw forbidden()
}

/** preorder.user_id !== userId → 403（operator 不代看顧客訂單，走 operator 端點） */
export async function assertPreorderOwner(
  userId: string,
  preorderId: string,
): Promise<void> {
  const preorder = await prisma.preorder.findUnique({
    where: { id: preorderId },
    select: { userId: true },
  })
  // 不存在也回 403，避免用回應差異探測他人訂單是否存在
  if (!preorder || preorder.userId !== userId) throw forbidden()
}

/**
 * 給列表查詢用：使用者可管理的攤位。
 * operator 回 'ALL'（不加 stallId 條件），其餘回可管理的 stallId 陣列（B-7）。
 */
export async function managedStallIds(userId: string): Promise<string[] | 'ALL'> {
  if (await isOperator(userId)) return 'ALL'
  const rows = await prisma.stallMember.findMany({
    where: { userId },
    select: { stallId: true },
  })
  return rows.map((r) => r.stallId)
}
