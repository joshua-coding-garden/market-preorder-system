/**
 * 07-驗收條件.md §S3：S3-6 ~ S3-14、S3-16、S3-17
 * 含拆單三層金額、idempotency、deadline、max_qty 併發。
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { PICKUP_ALPHABET } from '@market/shared'
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

const PICKUP_RE = new RegExp(`^[${PICKUP_ALPHABET}]{4}$`)

/**
 * 規格 01 §E 的範例場景：三攤五品項。
 *   小麥麵包 B03：可頌 80（加起司 +10、加火腿 +15）、吐司 120
 *   山上咖啡 B07：掛耳包 250（深焙 +0）、冰拿鐵 120
 *   阿蘭水餃 C01：水餃 180
 */
async function setupThreeStalls() {
  const app = await getTestApp()
  const customer = await createUser({ role: 'user' })
  const market = await createMarket('A')
  const day = await createMarketDay({
    marketId: market.id,
    status: 'PUBLISHED',
    openTime: '09:00',
    closeTime: '15:00',
  })

  const bread = await createStall('小麥麵包')
  const coffee = await createStall('山上咖啡')
  const dumpling = await createStall('阿蘭手工水餃')
  await createParticipation(day.id, bread.id, 'B03')
  await createParticipation(day.id, coffee.id, 'B07')
  await createParticipation(day.id, dumpling.id, 'C01')

  const croissant = await createProduct({
    stallId: bread.id,
    code: 'CR01',
    name: '可頌',
    basePrice: 80,
    components: [
      { name: '加起司', extraPrice: 10 },
      { name: '加火腿', extraPrice: 15 },
    ],
  })
  const toast = await createProduct({
    stallId: bread.id,
    code: 'TS01',
    name: '全麥吐司',
    basePrice: 120,
  })
  const drip = await createProduct({
    stallId: coffee.id,
    code: 'DB01',
    name: '掛耳包',
    basePrice: 250,
    components: [{ name: '深焙', extraPrice: 0, allowCustomNote: false }],
  })
  const latte = await createProduct({
    stallId: coffee.id,
    code: 'LT01',
    name: '冰拿鐵',
    basePrice: 120,
    components: [{ name: '換燕麥奶', extraPrice: 20 }],
  })
  const dp = await createProduct({
    stallId: dumpling.id,
    code: 'DP01',
    name: '高麗菜豬肉水餃',
    basePrice: 180,
  })

  const listings = {
    croissant: await createListing({
      marketDayId: day.id,
      productId: croissant.id,
      stallId: bread.id,
      price: 80,
    }),
    toast: await createListing({
      marketDayId: day.id,
      productId: toast.id,
      stallId: bread.id,
      price: 120,
    }),
    drip: await createListing({
      marketDayId: day.id,
      productId: drip.id,
      stallId: coffee.id,
      price: 250,
    }),
    latte: await createListing({
      marketDayId: day.id,
      productId: latte.id,
      stallId: coffee.id,
      price: 120,
    }),
    dumpling: await createListing({
      marketDayId: day.id,
      productId: dp.id,
      stallId: dumpling.id,
      price: 180,
    }),
  }

  return {
    app,
    customer,
    day,
    stalls: { bread, coffee, dumpling },
    products: { croissant, toast, drip, latte, dp },
    listings,
  }
}

async function addToCart(
  app: Awaited<ReturnType<typeof getTestApp>>,
  cookie: string,
  body: Record<string, unknown>,
) {
  const res = await request(app.server).post('/api/cart/items').set('Cookie', cookie).send(body)
  if (res.status >= 400) throw new Error(`加入購物車失敗：${JSON.stringify(res.body)}`)
  return res
}

function orderBody(dayId: string, overrides: Record<string, unknown> = {}) {
  return {
    marketDayId: dayId,
    contactName: '小美',
    contactPhone: '0912345678',
    pickupAt: '10:30',
    idempotencyKey: randomUUID(),
    ...overrides,
  }
}

describe('S3-9 拆單與三層金額', () => {
  it('三攤五品項含內容物 → 3 張子單，三層金額一致', async () => {
    const { app, customer, day, listings, products } = await setupThreeStalls()

    // 小麥麵包：可頌 ×2（加起司 +10、備註）、吐司 ×1
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.croissant.id,
      qty: 2,
      components: [{ componentId: products.croissant.components[0].id }],
      customNote: '不要太焦',
    })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    // 山上咖啡：掛耳包 ×1（深焙 +0）、冰拿鐵 ×2（換燕麥奶 +20）
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.drip.id,
      qty: 1,
      components: [{ componentId: products.drip.components[0].id }],
    })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.latte.id,
      qty: 2,
      components: [{ componentId: products.latte.components[0].id }],
    })
    // 阿蘭水餃：水餃 ×1
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.dumpling.id,
      qty: 1,
      components: [],
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(201)
    expect(res.body.subOrders).toHaveLength(3)

    const byStall = Object.fromEntries(
      res.body.subOrders.map((s: { stall: { name: string } }) => [s.stall.name, s]),
    )

    // 小麥麵包：(80+10)×2 = 180、120×1 = 120 → 300
    const bread = byStall['小麥麵包']
    expect(bread.boothNo).toBe('B03')
    expect(bread.subtotal).toBe(300)
    const croissantLine = bread.items.find((i: { productCode: string }) => i.productCode === 'CR01')
    expect(croissantLine.unitPrice).toBe(80)
    expect(croissantLine.qty).toBe(2)
    expect(croissantLine.lineTotal).toBe(180)
    expect(croissantLine.customNote).toBe('不要太焦')
    expect(croissantLine.components).toEqual([{ name: '加起司', extraPrice: 10 }])

    // 山上咖啡：(250+0)×1 = 250、(120+20)×2 = 280 → 530
    const coffee = byStall['山上咖啡']
    expect(coffee.boothNo).toBe('B07')
    expect(coffee.subtotal).toBe(530)

    // 阿蘭水餃：180
    const dumpling = byStall['阿蘭手工水餃']
    expect(dumpling.subtotal).toBe(180)

    // 三層一致：line_total 加總 = subtotal；subtotal 加總 = total
    for (const so of res.body.subOrders) {
      const sum = so.items.reduce((n: number, i: { lineTotal: number }) => n + i.lineTotal, 0)
      expect(so.subtotal).toBe(sum)
    }
    const totalFromSubs = res.body.subOrders.reduce(
      (n: number, s: { subtotal: number }) => n + s.subtotal,
      0,
    )
    expect(res.body.totalAmount).toBe(totalFromSubs)
    expect(res.body.totalAmount).toBe(300 + 530 + 180)

    // 每攤各自一組取貨碼，且互不相同
    const codes = res.body.subOrders.map((s: { pickupCode: string }) => s.pickupCode)
    expect(new Set(codes).size).toBe(3)
    for (const c of codes) expect(c).toMatch(PICKUP_RE)
  })

  it('S3-17 下單成功後購物車清空', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })

    await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))
      .expect(201)

    const cart = await request(app.server)
      .get(`/api/cart?marketDayId=${day.id}`)
      .set('Cookie', customer.cookie)

    expect(cart.body.itemCount).toBe(0)
    expect(cart.body.stalls).toHaveLength(0)
  })

  it('下單後會更新使用者電話（下次預填）', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id, { contactPhone: '0987654321' }))

    const user = await prisma.appUser.findUnique({ where: { id: customer.id } })
    expect(user?.phone).toBe('0987654321')
  })
})

describe('S3-6 / S3-7 / S3-8 下單前置檢查', () => {
  it('S3-6 電話格式錯 → 400 VALIDATION', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id, { contactPhone: '0812345678' }))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
  })

  it('S3-7 購物車空 → 400 CART_EMPTY', async () => {
    const { app, customer, day } = await setupThreeStalls()

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('CART_EMPTY')
  })

  it('S3-8 已過截止 → 409 MARKET_DAY_CLOSED', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    await prisma.marketDay.update({
      where: { id: day.id },
      data: { orderDeadline: new Date(Date.now() - 60_000) },
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('MARKET_DAY_CLOSED')
    expect(await prisma.preorder.count()).toBe(0)
  })

  it('未發布的場次也不能下單', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    await prisma.marketDay.update({ where: { id: day.id }, data: { status: 'DRAFT' } })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('MARKET_DAY_CLOSED')
  })

  it('取貨時間超出營業時間 → 400', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id, { pickupAt: '16:00' }))

    expect(res.status).toBe(400)
  })

  it('取貨時間不是 15 分鐘倍數 → 400', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id, { pickupAt: '10:20' }))

    expect(res.status).toBe(400)
  })
})

describe('S3-10 idempotency', () => {
  it('同一把 key 連送兩次 → 回同一個 id，DB 只有一筆', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })

    const body = orderBody(day.id)
    const first = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(body)
    const second = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(body)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.body.id).toBe(first.body.id)
    expect(await prisma.preorder.count()).toBe(1)
    expect(await prisma.subOrder.count()).toBe(1)
  })

  it('別人的 idempotencyKey 不會洩漏訂單', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    const other = await createUser({ role: 'user' })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const body = orderBody(day.id)
    await request(app.server).post('/api/orders').set('Cookie', customer.cookie).send(body)

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', other.cookie)
      .send(body)

    expect(res.status).toBe(403)
  })
})

describe('S3-12 商品在結帳前變成不可售', () => {
  it('listing 改 SOLD_OUT → 409 LISTING_UNAVAILABLE 且 listingIds 含該項', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.drip.id,
      qty: 1,
      components: [],
    })
    await prisma.listing.update({
      where: { id: listings.toast.id },
      data: { status: 'SOLD_OUT' },
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('LISTING_UNAVAILABLE')
    expect(res.body.listingIds).toContain(listings.toast.id)
    // 整筆交易回滾，不能留下半張訂單
    expect(await prisma.preorder.count()).toBe(0)
    expect(await prisma.subOrder.count()).toBe(0)
  })
})

describe('S3-11 max_qty 併發', () => {
  it('兩個交易同時搶最後一份，恰一個成功', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    const other = await createUser({ role: 'user' })

    await prisma.listing.update({ where: { id: listings.toast.id }, data: { maxQty: 1 } })

    for (const who of [customer, other]) {
      await addToCart(app, who.cookie, {
        marketDayId: day.id,
        listingId: listings.toast.id,
        qty: 1,
        components: [],
      })
    }

    const [a, b] = await Promise.all([
      request(app.server)
        .post('/api/orders')
        .set('Cookie', customer.cookie)
        .send(orderBody(day.id)),
      request(app.server).post('/api/orders').set('Cookie', other.cookie).send(orderBody(day.id)),
    ])

    const statuses = [a.status, b.status].sort()
    expect(statuses).toEqual([201, 409])

    const failed = a.status === 409 ? a : b
    expect(failed.body.error).toBe('LISTING_LIMIT_EXCEEDED')
    expect(failed.body.listingIds).toContain(listings.toast.id)

    expect(await prisma.preorder.count()).toBe(1)
  })

  it('NO_SHOW 與 CANCELLED 會釋出上限（04 §B）', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    const other = await createUser({ role: 'user' })
    await prisma.listing.update({ where: { id: listings.toast.id }, data: { maxQty: 1 } })

    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const first = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))
    expect(first.status).toBe(201)

    // 第二個人此時買不到
    await addToCart(app, other.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const blocked = await request(app.server)
      .post('/api/orders')
      .set('Cookie', other.cookie)
      .send(orderBody(day.id))
    expect(blocked.status).toBe(409)

    // 第一筆標記為未取後，額度釋出
    await prisma.subOrder.updateMany({
      where: { preorderId: first.body.id },
      data: { status: 'NO_SHOW' },
    })
    const retry = await request(app.server)
      .post('/api/orders')
      .set('Cookie', other.cookie)
      .send(orderBody(day.id))
    expect(retry.status).toBe(201)
  })

  it('單筆超過上限也會被擋下', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await prisma.listing.update({ where: { id: listings.toast.id }, data: { maxQty: 2 } })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 3,
      components: [],
    })

    const res = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('LISTING_LIMIT_EXCEEDED')
  })
})

describe('S3-13 / S3-14 訂單快照與存取權', () => {
  it('S3-13 事後改價不影響已成立訂單（B-5 快照）', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const created = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))
    const originalTotal = created.body.totalAmount

    await prisma.listing.update({ where: { id: listings.toast.id }, data: { price: 999 } })
    await prisma.product.update({
      where: { id: (await prisma.listing.findUnique({ where: { id: listings.toast.id } }))!.productId },
      data: { name: '改過的名字', code: 'CHANGED' },
    })

    const res = await request(app.server)
      .get(`/api/orders/${created.body.id}`)
      .set('Cookie', customer.cookie)

    expect(res.body.totalAmount).toBe(originalTotal)
    expect(res.body.subOrders[0].items[0].unitPrice).toBe(120)
    expect(res.body.subOrders[0].items[0].productName).toBe('全麥吐司')
    expect(res.body.subOrders[0].items[0].productCode).toBe('TS01')
  })

  it('S3-14 顧客 Y 讀顧客 X 的訂單 → 403', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    const other = await createUser({ role: 'user' })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const created = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    const res = await request(app.server)
      .get(`/api/orders/${created.body.id}`)
      .set('Cookie', other.cookie)

    expect(res.status).toBe(403)
    expect(JSON.stringify(res.body)).not.toContain('小美')
  })

  it('GET /orders 只回自己的訂單', async () => {
    const { app, customer, day, listings } = await setupThreeStalls()
    const other = await createUser({ role: 'user' })
    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    const mine = await request(app.server).get('/api/orders').set('Cookie', customer.cookie)
    const theirs = await request(app.server).get('/api/orders').set('Cookie', other.cookie)

    expect(mine.body.items).toHaveLength(1)
    expect(theirs.body.items).toHaveLength(0)
  })
})

describe('S3-16 取貨碼', () => {
  it('同場次 100 筆訂單的取貨碼全部唯一且符合字元集', async () => {
    const { app, day, listings } = await setupThreeStalls()

    for (let i = 0; i < 100; i += 1) {
      const buyer = await createUser({ role: 'user' })
      await addToCart(app, buyer.cookie, {
        marketDayId: day.id,
        listingId: listings.toast.id,
        qty: 1,
        components: [],
      })
      const res = await request(app.server)
        .post('/api/orders')
        .set('Cookie', buyer.cookie)
        .send(orderBody(day.id))
      expect(res.status).toBe(201)
    }

    const subOrders = await prisma.subOrder.findMany({
      where: { marketDayId: day.id },
      select: { pickupCode: true },
    })
    expect(subOrders).toHaveLength(100)

    const codes = subOrders.map((s) => s.pickupCode)
    expect(new Set(codes).size).toBe(100)
    for (const c of codes) expect(c).toMatch(PICKUP_RE)
  }, 60_000)

  it('不同場次可以出現相同取貨碼（每日刷新）', async () => {
    const { app, customer, day, listings, stalls, products } = await setupThreeStalls()
    const market = await prisma.marketDay.findUnique({ where: { id: day.id } })
    const day2 = await createMarketDay({
      marketId: market!.marketId,
      status: 'PUBLISHED',
      eventDate: '2099-11-11',
    })
    await createParticipation(day2.id, stalls.bread.id, 'B03')
    const listing2 = await createListing({
      marketDayId: day2.id,
      productId: products.toast.id,
      stallId: stalls.bread.id,
      price: 120,
    })

    await addToCart(app, customer.cookie, {
      marketDayId: day.id,
      listingId: listings.toast.id,
      qty: 1,
      components: [],
    })
    const first = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day.id))

    await addToCart(app, customer.cookie, {
      marketDayId: day2.id,
      listingId: listing2.id,
      qty: 1,
      components: [],
    })
    const second = await request(app.server)
      .post('/api/orders')
      .set('Cookie', customer.cookie)
      .send(orderBody(day2.id))

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    // UNIQUE 只在 (market_day_id, pickup_code)，跨場次不受限
    const codes = await prisma.subOrder.findMany({ select: { pickupCode: true } })
    expect(codes).toHaveLength(2)
  })
})
