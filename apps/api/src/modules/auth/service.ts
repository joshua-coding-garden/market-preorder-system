import type { MeResponse } from '@market/shared'
import { prisma } from '../../lib/db.js'
import type { LineIdTokenPayload } from '../../lib/lineLogin.js'
import { GOOGLE_USER_PREFIX, type GoogleIdTokenPayload } from '../../lib/googleLogin.js'
import {
  LOCAL_USER_PREFIX,
  hashPassword,
  normalizeUsername,
  verifyPassword,
} from '../../lib/localAuth.js'
import { AppError } from '../../lib/errors.js'

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

/**
 * ⚠️ 規格外：Google 登入的 upsert（委託方指示的暫時通道）。
 * 以 `google:{sub}` 寫進 line_user_id，與 LINE 帳號共用同一張表但不會互相碰撞。
 * 這種帳號收不到 LINE 推播（Sprint 5 的 sender 會跳過並記 FAILED）。
 */
export async function upsertUserFromGoogle(payload: GoogleIdTokenPayload): Promise<string> {
  const now = new Date()
  const lineUserId = `${GOOGLE_USER_PREFIX}${payload.sub}`
  const displayName = payload.name ?? payload.email ?? 'Google 使用者'
  const user = await prisma.appUser.upsert({
    where: { lineUserId },
    create: {
      lineUserId,
      displayName,
      pictureUrl: payload.picture ?? null,
      lastLoginAt: now,
    },
    update: {
      displayName,
      pictureUrl: payload.picture ?? null,
      lastLoginAt: now,
    },
    select: { id: true },
  })
  return user.id
}

/**
 * ⚠️ 規格外：帳號密碼註冊（委託方指示的暫時通道）。
 *
 * 憑證存在獨立的 `local_credential` 表，`app_user` 維持與 schema.sql 一致。
 * **系統還沒有任何 operator 時，第一個註冊的人自動成為管理員** ——
 * 否則沒有 LINE 就沒人進得了後台（bootstrap 問題）。
 */
export async function registerLocalUser(input: {
  username: string
  password: string
  displayName?: string
}): Promise<{ userId: string; promotedToOperator: boolean }> {
  const username = normalizeUsername(input.username)

  const taken = await prisma.localCredential.findUnique({ where: { username } })
  if (taken) throw new AppError('CONFLICT', '這個帳號已經有人用了')

  const passwordHash = await hashPassword(input.password)
  // 還沒有管理員時，第一個註冊者升為 operator
  const operatorCount = await prisma.appUser.count({ where: { role: 'operator' } })
  const promotedToOperator = operatorCount === 0

  const user = await prisma.appUser.create({
    data: {
      lineUserId: `${LOCAL_USER_PREFIX}${username}`,
      displayName: input.displayName?.trim() || username,
      role: promotedToOperator ? 'operator' : 'user',
      lastLoginAt: new Date(),
      localCredential: { create: { username, passwordHash } },
    },
    select: { id: true },
  })

  return { userId: user.id, promotedToOperator }
}

/**
 * ⚠️ 規格外：帳號密碼登入。
 * 帳號不存在與密碼錯誤回**完全相同**的錯誤，不透露帳號是否存在。
 */
export async function loginLocalUser(input: {
  username: string
  password: string
}): Promise<string> {
  const username = normalizeUsername(input.username)
  const invalid = new AppError('UNAUTHENTICATED', '帳號或密碼不正確')

  const credential = await prisma.localCredential.findUnique({ where: { username } })
  if (!credential) {
    // 帳號不存在時也跑一次雜湊，讓回應時間不因帳號存在與否而有明顯差異
    await verifyPassword(input.password, `${'0'.repeat(32)}:${'0'.repeat(128)}`)
    throw invalid
  }

  const ok = await verifyPassword(input.password, credential.passwordHash)
  if (!ok) throw invalid

  await prisma.appUser.update({
    where: { id: credential.userId },
    data: { lastLoginAt: new Date() },
  })
  return credential.userId
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
  if (!user) throw new AppError('NOT_FOUND', '使用者不存在')

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
