// 權限（04 §H）：
//   /cart*        requireAuth（購物車一律以 session 的 userId 為鍵）
//   POST /orders  requireAuth
//   GET  /orders  requireAuth
//   GET  /orders/:id  requireAuth → assertPreorderOwner
import type { FastifyPluginAsync } from 'fastify'
import {
  addCartItemSchema,
  cartQuerySchema,
  createOrderSchema,
  idParamSchema,
  updateCartItemSchema,
} from '@market/shared'
import { assertPreorderOwner, requireAuth } from '../../plugins/authz.js'
import {
  addCartItem,
  clearCart,
  deleteCartItem,
  getCart,
  updateCartItemQty,
} from './cartService.js'
import { createOrder, getMyOrder, listMyOrders } from './orderService.js'

const orderRoutes: FastifyPluginAsync = async (app) => {
  // ---------------- 購物車 ----------------

  app.get('/cart', async (req) => {
    const userId = requireAuth(req)
    const { marketDayId } = cartQuerySchema.parse(req.query)
    return getCart(userId, marketDayId)
  })

  app.post('/cart/items', async (req, reply) => {
    const userId = requireAuth(req)
    const input = addCartItemSchema.parse(req.body)
    const result = await addCartItem(userId, input)
    reply.code(result.merged ? 200 : 201)
    return result
  })

  app.patch('/cart/items/:id', async (req) => {
    const userId = requireAuth(req)
    const { id } = idParamSchema.parse(req.params)
    const { qty } = updateCartItemSchema.parse(req.body)
    return updateCartItemQty(userId, id, qty)
  })

  app.delete('/cart/items/:id', async (req, reply) => {
    const userId = requireAuth(req)
    const { id } = idParamSchema.parse(req.params)
    await deleteCartItem(userId, id)
    reply.code(204)
  })

  app.delete('/cart', async (req, reply) => {
    const userId = requireAuth(req)
    const { marketDayId } = cartQuerySchema.parse(req.query)
    await clearCart(userId, marketDayId)
    reply.code(204)
  })

  // ---------------- 訂單 ----------------

  app.post('/orders', async (req, reply) => {
    const userId = requireAuth(req)
    const input = createOrderSchema.parse(req.body)
    const { order, created } = await createOrder(userId, input)
    // 同一把 idempotencyKey 重送回 200，第一次建立回 201
    reply.code(created ? 201 : 200)
    return order
  })

  app.get('/orders', async (req) => {
    const userId = requireAuth(req)
    return { items: await listMyOrders(userId) }
  })

  app.get('/orders/:id', async (req) => {
    const userId = requireAuth(req)
    const { id } = idParamSchema.parse(req.params)
    await assertPreorderOwner(userId, id)
    return getMyOrder(id)
  })
}

export default orderRoutes
