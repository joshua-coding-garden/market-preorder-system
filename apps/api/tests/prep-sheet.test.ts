/**
 * 07-驗收條件.md §S4：S4-5、S4-6（備貨總表，D-07 / schema.sql Q2+Q3）
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { closeTestApp, createUser, resetDb } from './helpers.js'
import { placeOrder, setupTwoStalls } from './fixtures.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

describe('S4-5 備貨總表的商品層與內容物層', () => {
  it('可頌×2（加起司）、可頌×1（無）、吐司×1 → 可頌 3、吐司 1；加起司 2', async () => {
    const ctx = await setupTwoStalls()
    const cheese = ctx.products.croissant.components[0]

    // 三張不同的訂單，避免購物車合併掉
    const buyer1 = await createUser({ role: 'user' })
    const buyer2 = await createUser({ role: 'user' })
    const buyer3 = await createUser({ role: 'user' })

    await placeOrder(ctx.app, buyer1.cookie, ctx.day.id, [
      { listingId: ctx.listings.croissant.id, qty: 2, componentIds: [cheese.id] },
    ])
    await placeOrder(ctx.app, buyer2.cookie, ctx.day.id, [
      { listingId: ctx.listings.croissant.id, qty: 1 },
    ])
    await placeOrder(ctx.app, buyer3.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.status).toBe(200)

    const byCode = Object.fromEntries(
      res.body.products.map((p: { productCode: string }) => [p.productCode, p]),
    )

    expect(byCode.CR01.productName).toBe('可頌')
    expect(byCode.CR01.prepCount).toBe(3)
    expect(byCode.CR01.components).toEqual([{ name: '加起司', prepCount: 2 }])

    expect(byCode.TS01.prepCount).toBe(1)
    expect(byCode.TS01.components).toEqual([])

    expect(res.body.updatedAt).toBeTruthy()
  })

  it('只統計自己攤位的商品', async () => {
    const ctx = await setupTwoStalls()
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
      { listingId: ctx.listings.drip.id, qty: 5 },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.body.products).toHaveLength(1)
    expect(res.body.products[0].productCode).toBe('TS01')
    expect(JSON.stringify(res.body)).not.toContain('掛耳包')
  })
})

describe('S4-6 NO_SHOW 與 CANCELLED 不計入備貨', () => {
  it('子單標記 NO_SHOW 後不再計入', async () => {
    const ctx = await setupTwoStalls()
    const buyer = await createUser({ role: 'user' })
    const keep = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 2 },
    ])
    const drop = await placeOrder(ctx.app, buyer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 3 },
    ])

    const before = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(before.body.products[0].prepCount).toBe(5)

    await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${drop.subOrders[0].id}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'NO_SHOW' })
      .expect(200)

    const after = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(after.body.products[0].prepCount).toBe(2)
    expect(keep).toBeTruthy()
  })

  it('CANCELLED 也不計入，但 PICKED_UP 仍計入', async () => {
    const ctx = await setupTwoStalls()
    const buyer = await createUser({ role: 'user' })
    const picked = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const cancelled = await placeOrder(ctx.app, buyer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 4 },
    ])

    await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${picked.subOrders[0].id}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)
      .expect(200)
    await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${cancelled.subOrders[0].id}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'CANCELLED' })
      .expect(200)

    const res = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.body.products[0].prepCount).toBe(1)
  })
})

describe('廠商的合併備貨表（§9）', () => {
  it('各攤分開列出', async () => {
    const ctx = await setupTwoStalls()
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 2 },
      { listingId: ctx.listings.drip.id, qty: 3 },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/operator/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.stalls).toHaveLength(2)
    const names = res.body.stalls.map((s: { stall: { name: string } }) => s.stall.name).sort()
    expect(names).toEqual(['小麥麵包', '山上咖啡'].sort())
  })

  it('一般使用者不能看廠商備貨表', async () => {
    const ctx = await setupTwoStalls()
    const res = await request(ctx.app.server)
      .get(`/api/operator/market-days/${ctx.day.id}/prep-sheet`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(res.status).toBe(403)
  })
})

describe('S4-14 CSV 匯出（§9）', () => {
  it('UTF-8 BOM 開頭、欄位順序符合規格', async () => {
    const ctx = await setupTwoStalls()
    const cheese = ctx.products.croissant.components[0]
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.croissant.id, qty: 2, componentIds: [cheese.id], note: '不要太焦' },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/operator/market-days/${ctx.day.id}/export.csv`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')

    const text = res.text
    expect(text.charCodeAt(0)).toBe(0xfeff) // BOM
    const lines = text.slice(1).trim().split('\r\n')
    expect(lines[0]).toBe(
      '攤商,攤位,取貨碼,狀態,顧客姓名,電話,取貨時間,商品代碼,商品,內容物,特製備註,數量,單價,小計',
    )
    expect(lines[1]).toContain('小麥麵包')
    expect(lines[1]).toContain('B03')
    expect(lines[1]).toContain('待取貨')
    expect(lines[1]).toContain('加起司')
    expect(lines[1]).toContain('不要太焦')
    expect(lines[1]).toContain('180') // (80+10)×2
  })

  it('含逗號的欄位會被正確引號包住', async () => {
    const ctx = await setupTwoStalls()
    await prisma.stall.update({
      where: { id: ctx.stallA.id },
      data: { name: '小麥,麵包' },
    })
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .get(`/api/operator/market-days/${ctx.day.id}/export.csv`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.text).toContain('"小麥,麵包"')
  })
})
