// 權限（04 §H）：
//   所有 /stalls/:stallId/* 端點   requireAuth → assertStallMember(userId, stallId)
//   GET /market-days/:id/listings  公開（只回 PUBLISHED 場次的商品）
import type { FastifyPluginAsync } from 'fastify'
import {
  copyListingsSchema,
  createProductSchema,
  idParamSchema,
  listingQuerySchema,
  productListQuerySchema,
  replaceComponentsSchema,
  replaceListingsSchema,
  stallDayParamSchema,
  stallIdParamSchema,
  stallResourceParamSchema,
  updateProductSchema,
} from '@market/shared'
import { AppError } from '../../lib/errors.js'
import { MAX_IMAGE_BYTES, assertAcceptableImage } from '../../lib/image.js'
import { assertStallMember, requireAuth } from '../../plugins/authz.js'
import {
  copyListingsFrom,
  listPublicListings,
  listStallListings,
  replaceListings,
} from './listingService.js'
import {
  createProduct,
  deactivateProduct,
  listProducts,
  replaceComponents,
  setProductImage,
  updateProduct,
} from './service.js'

const productRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 顧客端 ----------------

  app.get('/market-days/:id/listings', async (req) => {
    const { id } = idParamSchema.parse(req.params)
    const filters = listingQuerySchema.parse(req.query)
    return { items: await listPublicListings(id, filters) }
  })

  // ---------------- 攤商：商品 ----------------

  app.get('/stalls/:stallId/products', async (req) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const { includeInactive } = productListQuerySchema.parse(req.query)
    return { items: await listProducts(stallId, includeInactive ?? false) }
  })

  app.post('/stalls/:stallId/products', async (req, reply) => {
    const userId = requireAuth(req)
    const { stallId } = stallIdParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    reply.code(201)
    return createProduct(stallId, createProductSchema.parse(req.body))
  })

  app.patch('/stalls/:stallId/products/:id', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return updateProduct(stallId, id, updateProductSchema.parse(req.body))
  })

  app.delete('/stalls/:stallId/products/:id', async (req, reply) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    await deactivateProduct(stallId, id)
    reply.code(204)
  })

  app.put('/stalls/:stallId/products/:id/components', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const input = replaceComponentsSchema.parse(req.body)
    return { items: await replaceComponents(stallId, id, input) }
  })

  app.post('/stalls/:stallId/products/:id/image', async (req) => {
    const userId = requireAuth(req)
    const { stallId, id } = stallResourceParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)

    const file = await req.file({ limits: { fileSize: MAX_IMAGE_BYTES + 1 } })
    if (!file) throw new AppError('VALIDATION', '請選擇要上傳的圖片（欄位名 file）')

    // 先看副檔名／MIME，型別不合就不用浪費時間讀完整個檔
    assertAcceptableImage(file.mimetype, 0)

    const buffer = await file.toBuffer().catch(() => {
      throw new AppError('IMAGE_TOO_LARGE', '圖片不能超過 8MB')
    })
    if (file.file.truncated || buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError('IMAGE_TOO_LARGE', '圖片不能超過 8MB')
    }

    return setProductImage(stallId, id, buffer, file.mimetype)
  })

  // ---------------- 攤商：本場上架 ----------------

  app.get('/stalls/:stallId/market-days/:dayId/listings', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    return { items: await listStallListings(stallId, dayId) }
  })

  app.put('/stalls/:stallId/market-days/:dayId/listings', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const input = replaceListingsSchema.parse(req.body)
    return { items: await replaceListings(stallId, dayId, input) }
  })

  app.post('/stalls/:stallId/market-days/:dayId/listings/copy-from', async (req) => {
    const userId = requireAuth(req)
    const { stallId, dayId } = stallDayParamSchema.parse(req.params)
    await assertStallMember(userId, stallId)
    const { sourceDayId } = copyListingsSchema.parse(req.body)
    return copyListingsFrom(stallId, dayId, sourceDayId)
  })
}

export default productRoutes
