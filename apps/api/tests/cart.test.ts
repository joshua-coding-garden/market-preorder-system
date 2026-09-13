/**
 * 07-驗收條件.md §S3：S3-2 ~ S3-4、S3-17
 */
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
  resetDb,
} from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

async function setup() {
  const app = await getTestApp()
  const customer = await createUser({ role: 'user' })
  const market = await createMarket('A')
  const day = await createMarketDay({ marketId: market.id, status: 'PUBLISHED' })
  const stall = await createStall('小麥麵包')
  await createParticipation(day.id, stall.id, 'B03')

  const product = await createProduct({
    stallId: stall.id,
    code: 'CR01',
    name: '可頌',
    basePrice: 80,
    components: [
      { name: '加起司', extraPrice: 10 },
      { name: '加火腿', extraPrice: 15 },
    ],
  })
  const listing = await createListing({
    marketDayId: day.id,
    productId: product.id,
    stallId: stall.id,
    price: 80,
    maxQty: 30,
  })

  return { app, customer, day, stall, product, listing }
}

describe('S3-2 相同內容物組合累加數量', () => {
  it('同 listing 同內容物再加 1 → qty 變 3，不新增列', async () => {
    const { app, customer, day, listing, product } = await setup()
    const cheese = product.components[0]

    const first = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 2,
        components: [{ componentId: cheese.id }],
        customNote: '不要太焦',
      })
    expect(first.status).toBe(201)

    const second = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: cheese.id }],
        customNote: '不要太焦',
      })
    expect(second.status).toBe(200)
    expect(second.body.merged).toBe(true)
    expect(second.body.qty).toBe(3)

    const rows = await prisma.cartItem.count()
    expect(rows).toBe(1)
  })
})

describe('S3-3 不同內容物組合新增一列', () => {
  it('同 listing 不同內容物 → 新增一列', async () => {
    const { app, customer, day, listing, product } = await setup()
    const [cheese, ham] = product.components

    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: cheese.id }],
      })

    const second = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: ham.id }],
      })

    expect(second.status).toBe(201)
    expect(second.body.merged).toBe(false)
    expect(await prisma.cartItem.count()).toBe(2)
  })

  it('備註不同也視為不同列（備註現在是項目層）', async () => {
    const { app, customer, day, listing, product } = await setup()
    const cheese = product.components[0]

    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: cheese.id }],
        customNote: '不要太焦',
      })
    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: cheese.id }],
        customNote: '烤久一點',
      })

    expect(await prisma.cartItem.count()).toBe(2)
  })

  it('沒有內容物與有內容物是不同列', async () => {
    const { app, customer, day, listing, product } = await setup()
    const cheese = product.components[0]

    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 1, components: [] })
    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: cheese.id }],
      })

    expect(await prisma.cartItem.count()).toBe(2)
  })
})

describe('S3-4 改數量與刪除', () => {
  it('qty=0 等同刪除', async () => {
    const { app, customer, day, listing } = await setup()
    const added = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 2, components: [] })

    const res = await request(app.server)
      .patch(`/api/cart/items/${added.body.id}`)
      .set('Cookie', customer.cookie)
      .send({ qty: 0 })

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
    expect(await prisma.cartItem.count()).toBe(0)
  })

  it('改數量成功', async () => {
    const { app, customer, day, listing } = await setup()
    const added = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 2, components: [] })

    const res = await request(app.server)
      .patch(`/api/cart/items/${added.body.id}`)
      .set('Cookie', customer.cookie)
      .send({ qty: 5 })

    expect(res.body.qty).toBe(5)
  })

  it('不能動別人的購物車項目', async () => {
    const { app, customer, day, listing } = await setup()
    const other = await createUser({ role: 'user' })
    const added = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 1, components: [] })

    const res = await request(app.server)
      .patch(`/api/cart/items/${added.body.id}`)
      .set('Cookie', other.cookie)
      .send({ qty: 9 })

    expect(res.status).toBe(404)
    const item = await prisma.cartItem.findUnique({ where: { id: added.body.id } })
    expect(item?.qty).toBe(1)
  })
})

describe('購物車內容與金額', () => {
  it('按攤商分組，含內容物加價的小計', async () => {
    const { app, customer, day, listing, product } = await setup()
    const cheese = product.components[0]

    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 2,
        components: [{ componentId: cheese.id }],
        customNote: '不要太焦',
      })

    const res = await request(app.server)
      .get(`/api/cart?marketDayId=${day.id}`)
      .set('Cookie', customer.cookie)

    expect(res.status).toBe(200)
    expect(res.body.stalls).toHaveLength(1)
    expect(res.body.stalls[0].stall.name).toBe('小麥麵包')
    expect(res.body.stalls[0].stall.boothNo).toBe('B03')
    // (80 + 10) × 2 = 180
    expect(res.body.stalls[0].items[0].lineTotal).toBe(180)
    expect(res.body.stalls[0].subtotal).toBe(180)
    expect(res.body.total).toBe(180)
    expect(res.body.stalls[0].items[0].customNote).toBe('不要太焦')
    expect(res.body.stalls[0].items[0].components[0].name).toBe('加起司')
  })

  it('listing 變 SOLD_OUT 時標記 unavailable', async () => {
    const { app, customer, day, listing } = await setup()
    await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 1, components: [] })

    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'SOLD_OUT' } })

    const res = await request(app.server)
      .get(`/api/cart?marketDayId=${day.id}`)
      .set('Cookie', customer.cookie)

    expect(res.body.stalls[0].items[0].unavailable).toBe(true)
    expect(res.body.hasUnavailable).toBe(true)
    // 不可用的項目不計入小計
    expect(res.body.total).toBe(0)
  })

  it('不能把別的場次的商品加進購物車', async () => {
    const { app, customer, listing, day } = await setup()
    const market2 = await createMarket('B')
    const otherDay = await createMarketDay({
      marketId: market2.id,
      status: 'PUBLISHED',
      eventDate: '2099-12-31',
    })

    const res = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: otherDay.id, listingId: listing.id, qty: 1, components: [] })

    expect(res.status).toBe(400)
    expect(day).toBeTruthy()
  })

  it('已下架的商品不能加入購物車', async () => {
    const { app, customer, day, listing } = await setup()
    await prisma.listing.update({ where: { id: listing.id }, data: { status: 'OFF_SHELF' } })

    const res = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({ marketDayId: day.id, listingId: listing.id, qty: 1, components: [] })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('LISTING_UNAVAILABLE')
  })

  it('不接受不屬於該商品的內容物 id', async () => {
    const { app, customer, day, listing } = await setup()
    const otherProduct = await createProduct({
      stallId: (await createStall('別攤')).id,
      code: 'X1',
      name: '別的商品',
      basePrice: 10,
      components: [{ name: '別的內容物', extraPrice: 5 }],
    })

    const res = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', customer.cookie)
      .send({
        marketDayId: day.id,
        listingId: listing.id,
        qty: 1,
        components: [{ componentId: otherProduct.components[0].id }],
      })

    expect(res.status).toBe(400)
  })
})
