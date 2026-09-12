// 權限（04 §H）：
//   GET /market-days        公開（只回 PUBLISHED）
//   GET /market-days/:id    公開；DRAFT 需 operator 才看得到
//   GET /operator/markets   requireAuth → assertOperator
import type { FastifyPluginAsync } from 'fastify'
import { idParamSchema, marketDayListQuerySchema, uuidSchema } from '@market/shared'
import { assertOperator, isOperator, requireAuth } from '../../plugins/authz.js'
import { getMarketDayDetail, listMarkets, listPublishedMarketDays } from './service.js'

const listQuerySchema = marketDayListQuerySchema.extend({
  cursor: uuidSchema.optional(),
})

const marketRoutes: FastifyPluginAsync = async (app) => {
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

  app.get('/operator/markets', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    return { items: await listMarkets() }
  })
}

export default marketRoutes
