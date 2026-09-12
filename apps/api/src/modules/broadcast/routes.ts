// 權限（04 §H）：
//   /stalls/:stallId/broadcasts*  requireAuth → assertStallMember
//   /operator/broadcasts*         requireAuth → assertOperator
import type { FastifyPluginAsync } from 'fastify'
import {
  broadcastListQuerySchema,
  createBroadcastSchema,
  idParamSchema,
  rejectBroadcastSchema,
  stallIdParamSchema,
  stallResourceParamSchema,
  updateBroadcastSchema,
} from '@market/shared'
import { AppError } from '../../lib/errors.js'
import { MAX_IMAGE_BYTES, assertAcceptableImage, storeImage } from '../../lib/image.js'
import { assertOperator, assertStallMember, requireAuth } from '../../plugins/authz.js'
import { prisma } from '../../lib/db.js'
import {
  approveBroadcast,
  createOperatorBroadcast,
  createStallBroadcast,
  estimateBroadcast,
  getOperatorBroadcast,
  getStallBroadcast,
  listOperatorBroadcasts,
  listStallBroadcasts,
  monthlyQuota,
  rejectBroadcast,
  sendBroadcast,
  updateBroadcast,
} from './service.js'

const broadcastRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 攤商 ----------------

  app.get('/stalls/:stallId/broadcasts', async (req) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return { items: await listStallBroadcasts(stallId) }
  })

  app.post('/stalls/:stallId/broadcasts', async (req, reply) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const input = createBroadcastSchema.parse(req.body)
    reply.code(201)
    return createStallBroadcast(stallId, userId, input)
  })

  app.post('/stalls/:stallId/broadcasts/:id/image', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    await getStallBroadcast(stallId, id)

    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES + 1 } })
    if (!file) throw new AppError('VALIDATION', '請選擇要上傳的圖片（欄位名 file）')
    assertAcceptableImage(file.mimetype, 0)

    const buffer = await file.toBuffer().catch(() => {
      throw new AppError('IMAGE_TOO_LARGE', '圖片不能超過 8MB')
    })
    if (file.file.truncated || buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError('IMAGE_TOO_LARGE', '圖片不能超過 8MB')
    }

    const stored = await storeImage(buffer, file.mimetype, `broadcasts/${id}`)
    await prisma.broadcast.update({ where: { id }, data: { imageUrl: stored.imageUrl } })
    return stored
  })

  // ---------------- 廠商 ----------------

  app.get('/operator/broadcasts', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { status } = broadcastListQuerySchema.parse(req.query)
    return { items: await listOperatorBroadcasts(status) }
  })

  app.post('/operator/broadcasts', async (req, reply) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const input = createBroadcastSchema.parse(req.body)
    reply.code(201)
    return createOperatorBroadcast(userId, input)
  })

  app.get('/operator/broadcasts/:id', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return getOperatorBroadcast(id)
  })

  app.patch('/operator/broadcasts/:id', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return updateBroadcast(id, updateBroadcastSchema.parse(req.body))
  })

  app.post('/operator/broadcasts/:id/approve', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return approveBroadcast(id, userId)
  })

  app.post('/operator/broadcasts/:id/reject', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    const { reason } = rejectBroadcastSchema.parse(req.body)
    return rejectBroadcast(id, userId, reason)
  })

  app.get('/operator/broadcasts/:id/estimate', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return estimateBroadcast(id)
  })

  app.post('/operator/broadcasts/:id/send', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    const { id } = idParamSchema.parse(req.params)
    return sendBroadcast(id)
  })

  /**
   * O1 儀表板的本月額度。
   * ⚠️ 03 §10 沒有列這支端點，但 06 迭代計畫要求 O1 顯示額度，
   *    而 §10 的 estimate 需要一個既有的 broadcast id。見 NOTES 的規格缺口說明。
   */
  app.get('/operator/message-quota', async (req) => {
    const userId = requireAuth(req)
    await assertOperator(userId)
    return monthlyQuota()
  })
}

export default broadcastRoutes
