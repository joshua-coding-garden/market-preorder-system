// 權限（04 §H）：
//   /operator/stalls*            requireAuth → assertOperator
//   /operator/market-days/:id/participations  requireAuth → assertOperator
//   /operator/participations/*   requireAuth → assertOperator
//   POST /stall/invite-codes/redeem           requireAuth（任何登入者都能兌換）
//   GET  /stalls/:stallId/market-days         requireAuth → assertStallMember
//   GET/PATCH /stalls/:stallId                requireAuth → assertStallMember（⚠️ 規格外）
//   POST /stalls/:stallId/sub-orders/:id/confirm  同上（⚠️ 規格外）
import type { FastifyPluginAsync } from 'fastify'
import {
  createParticipationSchema,
  createStallSchema,
  idParamSchema,
  pickupLookupSchema,
  redeemInviteSchema,
  stallDayParamSchema,
  stallIdParamSchema,
  stallResourceParamSchema,
  subOrderListQuerySchema,
  updateParticipationSchema,
  updateStallSchema,
  updateStallSelfSchema,
  updateSubOrderStatusSchema,
  uuidSchema,
} from '@market/shared'
import type { AppError } from '../../lib/errors.js'
import { assertOperator, assertStallMember, requireAuth } from '../../plugins/authz.js'
import {
  exportCsv,
  getStallSubOrder,
  listOperatorSubOrders,
  listStallSubOrders,
  lookupPickupCode,
  markPickedUp,
  operatorPrepSheet,
  prepSheet,
  setSubOrderStatus,
  confirmSubOrder,
} from './orderService.js'
import {
  createParticipation,
  createStall,
  getStallProfile,
  deleteParticipation,
  listParticipations,
  listStallMarketDays,
  listStalls,
  redeemInvite,
  reissueInviteCode,
  updateParticipation,
  updateStall,
  updateStallProfile,
} from './service.js'

const operatorSubOrderQuerySchema = subOrderListQuerySchema.extend({
  stallId: uuidSchema.optional(),
})

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

  // ---------------- 攤商：訂單、備貨、核銷（§8） ----------------

  app.get('/stalls/:stallId/market-days/:dayId/sub-orders', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const { status } = subOrderListQuerySchema.parse(req.query)
    return { items: await listStallSubOrders(stallId, dayId, status) }
  })

  app.get('/stalls/:stallId/sub-orders/:id', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return getStallSubOrder(stallId, id)
  })

  app.get('/stalls/:stallId/market-days/:dayId/prep-sheet', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return prepSheet(stallId, dayId)
  })

  app.post('/stalls/:stallId/market-days/:dayId/pickup/lookup', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const { code } = pickupLookupSchema.parse(req.body)
    return lookupPickupCode(stallId, dayId, code)
  })

  // ⚠️ 規格外（2026-09-20 指示）：攤商自己看／改基本資料
  app.get('/stalls/:stallId', async (req) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return getStallProfile(stallId)
  })

  app.patch('/stalls/:stallId', async (req) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return updateStallProfile(stallId, updateStallSelfSchema.parse(req.body))
  })

  app.post('/stalls/:stallId/sub-orders/:id/pickup', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return markPickedUp(stallId, id, userId)
  })

  // ⚠️ 規格外（2026-09-20 指示）：店家確認接單
  app.post('/stalls/:stallId/sub-orders/:id/confirm', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return confirmSubOrder(stallId, id, userId)
  })

  app.patch('/stalls/:stallId/sub-orders/:id/status', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const { status } = updateSubOrderStatusSchema.parse(req.body)
    return setSubOrderStatus(stallId, id, status)
  })

  // ---------------- 廠商：訂單總覽與匯出（§9） ----------------

  app.get('/operator/market-days/:id/sub-orders', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const query = operatorSubOrderQuerySchema.parse(req.query)
    return { items: await listOperatorSubOrders(id, query) }
  })

  app.get('/operator/market-days/:id/prep-sheet', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return operatorPrepSheet(id)
  })

  app.get('/operator/market-days/:id/export.csv', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const csv = await exportCsv(id)
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="orders-${id}.csv"`)
    return csv
  })
}

export default stallRoutes
