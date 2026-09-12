// 權限（04 §H）：
//   /operator/stalls*            requireAuth → assertOperator
//   /operator/market-days/:id/participations  requireAuth → assertOperator
//   /operator/participations/*   requireAuth → assertOperator
//   POST /stall/invite-codes/redeem           requireAuth（任何登入者都能兌換）
//   GET  /stalls/:stallId/market-days         requireAuth → assertStallMember
import type { FastifyPluginAsync } from 'fastify'
import {
  createParticipationSchema,
  createStallSchema,
  idParamSchema,
  redeemInviteSchema,
  stallIdParamSchema,
  updateParticipationSchema,
  updateStallSchema,
} from '@market/shared'
import type { AppError } from '../../lib/errors.js'
import { assertOperator, assertStallMember, requireAuth } from '../../plugins/authz.js'
import {
  createParticipation,
  createStall,
  deleteParticipation,
  listParticipations,
  listStallMarketDays,
  listStalls,
  redeemInvite,
  reissueInviteCode,
  updateParticipation,
  updateStall,
} from './service.js'

const stallRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 廠商：攤商管理 ----------------

  app.get('/operator/stalls', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    return { items: await listStalls() }
  })

  app.post('/operator/stalls', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const input = createStallSchema.parse(req.body)
    reply.code(201)
    return createStall(input)
  })

  app.patch('/operator/stalls/:id', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return updateStall(id, updateStallSchema.parse(req.body))
  })

  // ---------------- 廠商：參與與邀請碼 ----------------

  app.get('/operator/market-days/:id/participations', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return { items: await listParticipations(id) }
  })

  app.post('/operator/market-days/:id/participations', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const input = createParticipationSchema.parse(req.body)
    reply.code(201)
    return createParticipation(id, input)
  })

  app.patch('/operator/participations/:id', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const { boothNo } = updateParticipationSchema.parse(req.body)
    return updateParticipation(id, boothNo)
  })

  app.delete('/operator/participations/:id', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    await deleteParticipation(id)
    reply.code(204)
  })

  app.post('/operator/participations/:id/invite-codes/reissue', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return reissueInviteCode(id)
  })

  // ---------------- 攤商：兌換邀請碼 ----------------

  app.post('/stall/invite-codes/redeem', async (req) => {
    const userId = requireAuth(req)
    const { code } = redeemInviteSchema.parse(req.body)
    try {
      return await redeemInvite(userId, code)
    } catch (err) {
      const reason = (err as AppError & { reason?: string }).reason
      // 對外訊息統一，實際原因只留在伺服器 log（04 §C）
      if (reason) req.log.info({ code, reason }, 'invite redeem rejected')
      throw err
    }
  })

  // ---------------- 攤商：我的場次 ----------------

  app.get('/stalls/:stallId/market-days', async (req) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return { items: await listStallMarketDays(stallId) }
  })
}

export default stallRoutes
