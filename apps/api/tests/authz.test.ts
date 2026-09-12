/**
 * 07-驗收條件.md §S4：S4-3、S4-4（攤商隔離）
 *
 * S4-4 要求「攤商 A 對 B 的每一個 §4/§5/§8 端點各打一次 → 全部 403，
 * body 無 B 的任何欄位」。這裡把那些端點列成表逐一打過。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { closeTestApp, resetDb } from './helpers.js'
import { placeOrder, setupTwoStalls } from './fixtures.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

describe('S4-3 攤商只看得到自己的子單', () => {
  it('A 的子單列表不含 B 的子單', async () => {
    const ctx = await setupTwoStalls()
    // 一筆跨兩攤的訂單
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])
    expect(order.subOrders).toHaveLength(2)

    const aList = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/sub-orders`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(aList.status).toBe(200)
    expect(aList.body.items).toHaveLength(1)
    expect(aList.body.items[0].items[0].productName).toBe('全麥吐司')
    // 不得出現 B 的商品
    expect(JSON.stringify(aList.body)).not.toContain('掛耳包')

    const bList = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallB.id}/market-days/${ctx.day.id}/sub-orders`)
      .set('Cookie', ctx.ownerB.cookie)
    expect(bList.body.items).toHaveLength(1)
    expect(JSON.stringify(bList.body)).not.toContain('全麥吐司')
  })
})

describe('S4-4 攤商 A 打攤商 B 的所有端點一律 403', () => {
  it('§4／§5／§8 每一支端點都回 403，且不洩漏 B 的資料', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])
    const bSubOrderId = order.subOrders[0].id
    const B = ctx.stallB.id
    const day = ctx.day.id
    const bProductId = ctx.products.drip.id

    // [method, path, body?]
    const endpoints: [string, string, unknown?][] = [
      // §4 商品與內容物
      ['get', `/api/stalls/${B}/products`],
      ['post', `/api/stalls/${B}/products`, { code: 'HACK', name: 'x', basePrice: 1 }],
      ['patch', `/api/stalls/${B}/products/${bProductId}`, { name: 'x' }],
      ['delete', `/api/stalls/${B}/products/${bProductId}`],
      ['put', `/api/stalls/${B}/products/${bProductId}/components`, []],
      // §5 本場上架
      ['get', `/api/stalls/${B}/market-days`],
      ['get', `/api/stalls/${B}/market-days/${day}/listings`],
      ['put', `/api/stalls/${B}/market-days/${day}/listings`, []],
      [
        'post',
        `/api/stalls/${B}/market-days/${day}/listings/copy-from`,
        { sourceDayId: day },
      ],
      // §8 訂單、備貨、核銷
      ['get', `/api/stalls/${B}/market-days/${day}/sub-orders`],
      ['get', `/api/stalls/${B}/sub-orders/${bSubOrderId}`],
      ['get', `/api/stalls/${B}/market-days/${day}/prep-sheet`],
      [
        'post',
        `/api/stalls/${B}/market-days/${day}/pickup/lookup`,
        { code: order.subOrders[0].pickupCode },
      ],
      ['post', `/api/stalls/${B}/sub-orders/${bSubOrderId}/pickup`],
      ['patch', `/api/stalls/${B}/sub-orders/${bSubOrderId}/status`, { status: 'NO_SHOW' }],
      // §10 推播的兩支端點在 Sprint 6 補上（S6-9）
    ]

    for (const [method, path, body] of endpoints) {
      const req = request(ctx.app.server)
      const call =
        method === 'get'
          ? req.get(path)
          : method === 'post'
            ? req.post(path)
            : method === 'patch'
              ? req.patch(path)
              : method === 'put'
                ? req.put(path)
                : req.delete(path)

      const res = await call.set('Cookie', ctx.ownerA.cookie).send(body as object)

      expect(
        res.status,
        `${method.toUpperCase()} ${path} 應回 403，實際 ${res.status}`,
      ).toBe(403)
      expect(res.body.error).toBe('FORBIDDEN')

      const serialized = JSON.stringify(res.body)
      expect(serialized).not.toContain('掛耳包')
      expect(serialized).not.toContain('山上咖啡')
      expect(serialized).not.toContain(order.subOrders[0].pickupCode)
    }
  })

  it('operator 可以打任何攤商的端點（D-01）', async () => {
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallB.id}/market-days/${ctx.day.id}/sub-orders`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
  })

  it('未登入打攤商端點回 401', async () => {
    const ctx = await setupTwoStalls()
    const res = await request(ctx.app.server).get(`/api/stalls/${ctx.stallA.id}/products`)
    expect(res.status).toBe(401)
  })

  it('顧客訂單只看得到自己的，攤商也不能用顧客端點看別人訂單', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/orders/${order.id}`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.status).toBe(403)
  })
})
