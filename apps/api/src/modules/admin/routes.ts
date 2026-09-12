// ⚠️ 規格外：帳號與權限管理 + 身分模擬（委託方 2026-09-12 指示）。
//
// 權限（04 §H）：
//   GET   /operator/accounts               requireAuth → assertOperator
//   PATCH /operator/accounts/:id/role      requireAuth → assertOperator
//   POST  /operator/accounts/:id/stalls    requireAuth → assertOperator
//   DELETE /operator/accounts/:id/stalls/:stallId  requireAuth → assertOperator
//   POST  /operator/impersonation          requireAuth → assertOperator
//   DELETE /auth/impersonation             憑 mp_impersonator cookie 還原（模擬中可能已無 session）
//   GET   /auth/impersonation              公開；回目前模擬狀態
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { idParamSchema, uuidSchema } from '@market/shared'
import { config } from '../../config.js'
import { AppError } from '../../lib/errors.js'
import { assertOperator, requireAuth } from '../../plugins/authz.js'
import {
  addAccountToStall,
  getAccountBrief,
  impersonationTargets,
  listAccounts,
  removeAccountFromStall,
  setAccountRole,
} from './service.js'

const roleSchema = z.object({ role: z.enum(['user', 'operator']) })
const stallBodySchema = z.object({ stallId: uuidSchema })
const stallParamSchema = z.object({ id: uuidSchema, stallId: uuidSchema })

/** 模擬對象：某個帳號，或「未登入的訪客」 */
const impersonateSchema = z.discriminatedUnion('as', [
  z.object({ as: z.literal('USER'), userId: uuidSchema }),
  z.object({ as: z.literal('GUEST') }),
])

function assertImpersonationEnabled(): void {
  if (!config.ENABLE_IMPERSONATION) {
    throw new AppError(
      'FORBIDDEN',
      '身分模擬未啟用。請在 .env 設定 ENABLE_IMPERSONATION=true（正式環境請勿開啟）',
    )
  }
}

const adminRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 帳號與權限 ----------------

  app.get('/operator/accounts', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const result = await listAccounts()
    return { ...result, selfId: userId }
  })

  app.patch('/operator/accounts/:id/role', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const { role } = roleSchema.parse(req.body)
    return setAccountRole(userId, id, role)
  })

  app.post('/operator/accounts/:id/stalls', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const { stallId } = stallBodySchema.parse(req.body)
    reply.code(201)
    return addAccountToStall(id, stallId)
  })

  app.delete('/operator/accounts/:id/stalls/:stallId', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id, stallId } = stallParamSchema.parse(req.params)
    await removeAccountFromStall(id, stallId)
    reply.code(204)
  })

  // ---------------- 身分模擬 ----------------

  app.get('/operator/impersonation/targets', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    assertImpersonationEnabled()
    return { items: await impersonationTargets(), enabled: true }
  })

  app.post('/operator/impersonation', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    assertImpersonationEnabled()

    if (req.impersonatorId) {
      throw new AppError('CONFLICT', '已經在模擬中，請先結束目前的模擬')
    }

    const input = impersonateSchema.parse(req.body)
    await reply.setImpersonatorCookie(userId)

    if (input.as === 'GUEST') {
      // 模擬「未登入」：清掉 session，還原資訊留在 mp_impersonator
      reply.clearSessionCookie()
      return { as: 'GUEST' as const, target: null }
    }

    const target = await getAccountBrief(input.userId)
    // 換發 session：之後所有 assert* 都會以被模擬者的身分重查資料庫，
    // 權限是真的降下去，不是前端把按鈕藏起來
    await reply.setSessionCookie(target.id, userId)
    return { as: 'USER' as const, target }
  })

  /** 還原：憑 mp_impersonator cookie，模擬成訪客時也能呼叫 */
  app.delete('/auth/impersonation', async (req, reply) => {
    const operatorId = req.impersonatorId
    if (!operatorId) throw new AppError('CONFLICT', '目前不在模擬狀態')

    const operator = await getAccountBrief(operatorId)
    if (operator.role !== 'operator') {
      // 原始帳號已不是管理員：直接登出，不還原
      reply.clearSessionCookie()
      reply.clearImpersonatorCookie()
      throw new AppError('FORBIDDEN', '原始帳號已不具管理員權限，已為您登出')
    }

    await reply.setSessionCookie(operatorId)
    reply.clearImpersonatorCookie()
    return { restored: operator }
  })

  /** 模擬狀態（公開：模擬成訪客時沒有 session 也要讀得到） */
  app.get('/auth/impersonation', async (req) => {
    if (!req.impersonatorId) return { active: false, original: null, target: null }
    const original = await getAccountBrief(req.impersonatorId).catch(() => null)
    const target = req.sessionUserId
      ? await getAccountBrief(req.sessionUserId).catch(() => null)
      : null
    return { active: true, original, target }
  })
}

export default adminRoutes
