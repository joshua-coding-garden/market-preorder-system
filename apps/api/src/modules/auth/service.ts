import type { MeResponse } from '@market/shared'
import { prisma } from '../../lib/db.js'
import type { LineIdTokenPayload } from '../../lib/lineLogin.js'
import { notFound } from '../../lib/errors.js'

/** LINE 登入成功後 upsert app_user（以 line_user_id 為鍵） */
export async function upsertUserFromLine(payload: LineIdTokenPayload): Promise<string> {
  const now = new Date()
  const user = await prisma.appUser.upsert({
    where: { lineUserId: payload.sub },
    create: {
      lineUserId: payload.sub,
      displayName: payload.name ?? '',
      pictureUrl: payload.picture ?? null,
      lastLoginAt: now,
    },
    update: {
      // 顯示名稱與頭像以 LINE 最新資料為準
      displayName: payload.name ?? '',
      pictureUrl: payload.picture ?? null,
      lastLoginAt: now,
    },
    select: { id: true },
  })
  return user.id
}

/** GET /me：身分與能力一律由後端查出（B-1、D-01） */
export async function getMe(userId: string): Promise<MeResponse> {
  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      pictureUrl: true,
      phone: true,
      role: true,
      stallMemberships: {
        select: { stall: { select: { id: true, name: true } } },
        orderBy: { joinedAt: 'asc' },
      },
    },
  })
  if (!user) throw notFound('使用者不存在')

  const stalls = user.stallMemberships.map((m) => m.stall)
  const isOperator = user.role === 'operator'

  return {
    id: user.id,
    displayName: user.displayName,
    pictureUrl: user.pictureUrl,
    phone: user.phone,
    role: user.role,
    stalls,
    capabilities: {
      customer: true,
      // operator 可代任何攤商操作（D-01 / 04 §H）
      stall: stalls.length > 0 || isOperator,
      operator: isOperator,
    },
  }
}
