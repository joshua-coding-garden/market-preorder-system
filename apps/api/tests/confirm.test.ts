/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：
 * 下單後先進「店家確認中」，店家確認了才算訂單成立。
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import {
  closeTestApp,
  createListing,
  createMarket,
  createMarketDay,
  createParticipation,
  createProduct,
  createStall,
  createUser,
  getTestApp,
  joinStall,
  resetDb,
} from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

async function setup(opts: { maxQty?: number | null } = {}) {
  const app = await getTestApp()
  const customer = await createUser({ role: 'user' })
  const stallUser = await createUser({ role: 'user' })
  const market = await createMarket('A')
  const day = await createMarketDay({ marketId: market.id, status: 'PUBLISHED' })
  const stall = await createStall('小麥麵包')
  await joinStall(stallUser.id, stall.id)
  await createParticipation(day.id, stall.id, 'B03')
  const product = await createProduct({
    stallId: stall.id,
    code: 'CR01',
    name: '可頌',
    basePrice: 80,
  })
  const listing = await createListing({
    marketDayId: day.id,
    productId: product.id,
    stallId: stall.id,
    price: 80,
    maxQty: opts.maxQty === undefined ? 30 : opts.maxQty,
  })
  return { app, customer, stallUser, day, stall, product, listing }
}

async function placeOrder(
  app: Awaited<ReturnType<typeof getTestApp>>,
  cookie: string,
  dayId: string,
  listingId: string,
  qty = 1,
) {
  await request(app.server)
    .post('/api/cart/items')
    .set('Cookie', cookie)
    .send({ marketDayId: dayId, listingId, qty, components: [] })

  return request(app.server)
    .post('/api/orders')
    .set('Cookie', cookie)
    .send({
      marketDayId: dayId,
      contactName: '陳小明',
      contactPhone: '0912345678',
      pickupAt: '10:30',
      idempotencyKey: randomUUID(),
    })
}

describe('下單後的初始狀態', () => {
  it('子單一律是 PENDING_CONFIRM（店家確認中）', async () => {
    const { app, customer, day, listing } = await setup()

    const res = await placeOrder(app, customer.cookie, day.id, listing.id)
    expect(res.status).toBe(201)
    expect(res.body.subOrders[0].status).toBe('PENDING_CONFIRM')

    const rows = await prisma.subOrder.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('PENDING_CONFIRM')
    expect(rows[0].confirmedAt).toBeNull()
  })

  it('顧客的訂單詳情看得到這個狀態', async () => {
    const { app, customer, day, listing } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)

    const detail = await request(app.server)
      .get(`/api/orders/${placed.body.id}`)
      .set('Cookie', customer.cookie)
    expect(detail.body.subOrders[0].status).toBe('PENDING_CONFIRM')
  })
})

describe('店家確認', () => {
  it('確認之後變成 PENDING（訂單成立），並記下是誰確認的', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const subOrderId = placed.body.subOrders[0].id

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/confirm`)
      .set('Cookie', stallUser.cookie)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PENDING')

    const row = await prisma.subOrder.findUnique({ where: { id: subOrderId } })
    expect(row?.status).toBe('PENDING')
    expect(row?.confirmedAt).not.toBeNull()
    expect(row?.confirmedByUserId).toBe(stallUser.id)
  })

  it('重複確認回 409，不會蓋掉原本的確認時間', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const subOrderId = placed.body.subOrders[0].id

    await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/confirm`)
      .set('Cookie', stallUser.cookie)
    const first = await prisma.subOrder.findUnique({ where: { id: subOrderId } })

    const again = await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/confirm`)
      .set('Cookie', stallUser.cookie)
    expect(again.status).toBe(409)

    const after = await prisma.subOrder.findUnique({ where: { id: subOrderId } })
    expect(after?.confirmedAt?.toISOString()).toBe(first?.confirmedAt?.toISOString())
  })

  it('別攤的人確認不了', async () => {
    const { app, customer, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const outsider = await createUser({ role: 'user' })

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${placed.body.subOrders[0].id}/confirm`)
      .set('Cookie', outsider.cookie)
    expect(res.status).toBe(403)
  })

  it('店家可以婉拒，訂單變 CANCELLED', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const subOrderId = placed.body.subOrders[0].id

    const res = await request(app.server)
      .patch(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/status`)
      .set('Cookie', stallUser.cookie)
      .send({ status: 'CANCELLED' })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('CANCELLED')
  })
})

describe('未確認就不能核銷', () => {
  it('PENDING_CONFIRM 直接核銷會被擋下', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const subOrderId = placed.body.subOrders[0].id

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', stallUser.cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('NOT_CONFIRMED')

    expect((await prisma.subOrder.findUnique({ where: { id: subOrderId } }))?.status).toBe(
      'PENDING_CONFIRM',
    )
  })

  it('確認過就核銷得了', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const placed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const subOrderId = placed.body.subOrders[0].id

    await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/confirm`)
      .set('Cookie', stallUser.cookie)
    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', stallUser.cookie)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PICKED_UP')
  })
})

describe('未確認的訂單也佔預購上限', () => {
  it('還沒確認就已經算進上限，不會超賣', async () => {
    const { app, customer, day, listing } = await setup({ maxQty: 2 })
    const other = await createUser({ role: 'user' })

    const first = await placeOrder(app, customer.cookie, day.id, listing.id, 2)
    expect(first.status).toBe(201)

    const second = await placeOrder(app, other.cookie, day.id, listing.id, 1)
    expect(second.status).toBe(409)
    expect(second.body.error).toBe('LISTING_LIMIT_EXCEEDED')
  })

  it('被婉拒之後額度會還回去', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup({ maxQty: 2 })
    const other = await createUser({ role: 'user' })

    const first = await placeOrder(app, customer.cookie, day.id, listing.id, 2)
    await request(app.server)
      .patch(`/api/stalls/${stall.id}/sub-orders/${first.body.subOrders[0].id}/status`)
      .set('Cookie', stallUser.cookie)
      .send({ status: 'CANCELLED' })

    const second = await placeOrder(app, other.cookie, day.id, listing.id, 2)
    expect(second.status).toBe(201)
  })
})

describe('關場時的處理', () => {
  it('關場時還沒確認的訂單視為取消，已確認未取貨的才是 NO_SHOW', async () => {
    const { app, customer, stallUser, day, listing, stall } = await setup()
    const other = await createUser({ role: 'user' })
    const operator = await createUser({ role: 'operator' })

    const unconfirmed = await placeOrder(app, customer.cookie, day.id, listing.id)
    const confirmed = await placeOrder(app, other.cookie, day.id, listing.id)
    await request(app.server)
      .post(`/api/stalls/${stall.id}/sub-orders/${confirmed.body.subOrders[0].id}/confirm`)
      .set('Cookie', stallUser.cookie)

    const close = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/close`)
      .set('Cookie', operator.cookie)
    expect(close.status).toBe(200)

    const a = await prisma.subOrder.findUnique({
      where: { id: unconfirmed.body.subOrders[0].id },
    })
    const b = await prisma.subOrder.findUnique({
      where: { id: confirmed.body.subOrders[0].id },
    })
    expect(a?.status).toBe('CANCELLED')
    expect(b?.status).toBe('NO_SHOW')
  })
})
