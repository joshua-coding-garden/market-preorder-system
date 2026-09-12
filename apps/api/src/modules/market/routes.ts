// 權限（04 §H）：
//   GET  /market-days              公開（只回 PUBLISHED）
//   GET  /market-days/:id          公開；DRAFT 需 operator 才看得到
//   /operator/markets*             requireAuth → assertOperator
//   /operator/market-days*         requireAuth → assertOperator
import type { FastifyPluginAsync } from 'fastify'
import {
  createMarketDaySchema,
  createMarketSchema,
  idParamSchema,
  marketDayListQuerySchema,
  operatorMarketDayListQuerySchema,
  updateMarketDaySchema,
  uuidSchema,
} from '@market/shared'
import { assertOperator, isOperator, requireAuth } from '../../plugins/authz.js'
import {
  closeMarketDay,
  createMarket,
  createMarketDay,
  getMarketDayDetail,
  listMarkets,
  listOperatorMarketDays,
  listPublishedMarketDays,
  publishMarketDay,
  unpublishMarketDay,
  updateMarketDay,
} from './service.js'

const listQuerySchema = marketDayListQuerySchema.extend({
  cursor: uuidSchema.optional(),
})

const marketRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 顧客端 ----------------

  app.get('/market-days', async (req) => {
    const query = listQuerySchema.parse(req.query)
    return listPublishedMarketDays(query)
  })

  app.get('/market-days/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params)
    // 公開端點：登入者才可能是 operator，未登入一律以顧客視角
    const viewerIsOperator = req.sessionUserId
      ? await isOperator(req.sessionUserId)
      : false
    return getMarketDayDetail(id, viewerIsOperator)
  })

  // ---------------- 廠商：市集 ----------------

  app.get('/operator/markets', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    return { items: await listMarkets() }
  })

  app.post('/operator/markets', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const input = createMarketSchema.parse(req.body)
    reply.code(201)
    return createMarket(input)
  })

  // ---------------- 廠商：場次 ----------------

  app.get('/operator/market-days', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const query = operatorMarketDayListQuerySchema.parse(req.query)
    return { items: await listOperatorMarketDays(query) }
  })

  app.post('/operator/market-days', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const input = createMarketDaySchema.parse(req.body)
    reply.code(201)
    return createMarketDay(input)
  })

  app.patch('/operator/market-days/:id', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return updateMarketDay(id, updateMarketDaySchema.parse(req.body))
  })

  app.post('/operator/market-days/:id/publish', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return publishMarketDay(id)
  })

  app.post('/operator/market-days/:id/unpublish', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return unpublishMarketDay(id)
  })

  app.post('/operator/market-days/:id/close', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return closeMarketDay(id)
  })
}

export default marketRoutes
