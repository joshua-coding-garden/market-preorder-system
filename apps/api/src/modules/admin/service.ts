import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'
import { GOOGLE_USER_PREFIX } from '../../lib/googleLogin.js'

/**
 * ⚠️ 規格外：帳號與權限管理（委託方 2026-09-12 指示）。
 *
 * 規格 D-01 只定義三種身分，沒有獨立的「系統管理員」角色。
 * 這裡把 `operator` 當成系統管理身分使用 —— 它本來就是最高權限，
 * 不需要新增 role 列舉或改資料表。
 *
 * 安全規則（比照委託方提供的參考實作）：
 *   1. 不能更改自己的權限
 *   2. 系統一定保留至少一個 operator
 * 權限判斷每次都重查資料庫（B-1），因此改權限對既有 session 立即生效。
 */

export type AccountRole = 'user' | 'operator'

function describeAccount(lineUserId: string): {
  provider: 'LINE' | 'GOOGLE'
  loginId: string
} {
  return lineUserId.startsWith(GOOGLE_USER_PREFIX)
    ? { provider: 'GOOGLE', loginId: lineUserId.slice(GOOGLE_USER_PREFIX.length) }
    : { provider: 'LINE', loginId: lineUserId }
}

export async function listAccounts() {
  const users = await prisma.appUser.findMany({
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    include: {
      stallMemberships: { include: { stall: { select: { id: true, name: true } } } },
      _count: { select: { preorders: true } },
    },
  })

  const operatorCount = users.filter((u) => u.role === 'operator').length

  return {
    summary: {
      operator: operatorCount,
      stall: users.filter((u) => u.role !== 'operator' && u.stallMemberships.length > 0)
        .length,
      customer: users.filter((u) => u.role !== 'operator' && u.stallMemberships.length === 0)
        .length,
      total: users.length,
    },
    items: users.map((u) => ({
      id: u.id,
      ...describeAccount(u.lineUserId),
      displayName: u.displayName,
      pictureUrl: u.pictureUrl,
      phone: u.phone,
      role: u.role as AccountRole,
      stalls: u.stallMemberships.map((m) => m.stall),
      orderCount: u._count.preorders,
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
  }
}

export async function setAccountRole(
  actingUserId: string,
  targetUserId: string,
  role: AccountRole,
) {
  if (actingUserId === targetUserId) {
    throw new AppError('CONFLICT', '不能更改自己的權限，避免把自己鎖在系統外面')
  }

  const target = await prisma.appUser.findUnique({ where: { id: targetUserId } })
  if (!target) throw notFound('找不到帳號')

  if (target.role === 'operator' && role !== 'operator') {
    const operatorCount = await prisma.appUser.count({ where: { role: 'operator' } })
    if (operatorCount <= 1) {
      throw new AppError('CONFLICT', '系統至少要保留一位管理員')
    }
  }

  const updated = await prisma.appUser.update({
    where: { id: targetUserId },
    data: { role },
    select: { id: true, role: true, displayName: true },
  })
  return updated
}

/** 直接把帳號加進某個攤商（不經邀請碼；僅管理員可用） */
export async function addAccountToStall(userId: string, stallId: string) {
  const [user, stall] = await Promise.all([
    prisma.appUser.findUnique({ where: { id: userId } }),
    prisma.stall.findUnique({ where: { id: stallId } }),
  ])
  if (!user) throw notFound('找不到帳號')
  if (!stall) throw notFound('找不到攤商')

  await prisma.stallMember.upsert({
    where: { userId_stallId: { userId, stallId } },
    create: { userId, stallId },
    update: {},
  })
  return { id: stall.id, name: stall.name }
}

export async function removeAccountFromStall(userId: string, stallId: string) {
  const member = await prisma.stallMember.findUnique({
    where: { userId_stallId: { userId, stallId } },
  })
  if (!member) throw notFound('這個帳號不屬於該攤商')
  await prisma.stallMember.delete({ where: { userId_stallId: { userId, stallId } } })
}

/** 身分模擬可以選的對象 */
export async function impersonationTargets() {
  const users = await prisma.appUser.findMany({
    orderBy: [{ role: 'desc' }, { displayName: 'asc' }],
    include: { stallMemberships: { include: { stall: { select: { id: true, name: true } } } } },
    take: 200,
  })
  return users.map((u) => ({
    id: u.id,
    displayName: u.displayName || describeAccount(u.lineUserId).loginId,
    role: u.role as AccountRole,
    stalls: u.stallMemberships.map((m) => m.stall),
  }))
}

export async function getAccountBrief(userId: string) {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    include: { stallMemberships: { include: { stall: { select: { id: true, name: true } } } } },
  })
  if (!user) throw notFound('找不到帳號')
  return {
    id: user.id,
    displayName: user.displayName,
    role: user.role as AccountRole,
    stalls: user.stallMemberships.map((m) => m.stall),
  }
}
