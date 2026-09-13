/**
 * 07-驗收條件.md §S4：S4-7 ~ S4-13（核銷與子單狀態機 04 §B）
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { events } from '../src/lib/events.js'
import { closeTestApp, createUser, resetDb } from './helpers.js'
import { placeOrder, setupTwoStalls, subOrderStatus } from './fixtures.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

describe('S4-7 ~ S4-9 查碼', () => {
  it('S4-7 自己攤位的正確碼 → 200 並回子單摘要', async () => {
    const ctx = await setupTwoStalls()
    const cheese = ctx.products.croissant.components[0]
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.croissant.id, qty: 2, componentIds: [cheese.id], note: '不要太焦' },
    ])
    const code = order.subOrders[0].pickupCode

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ code })

    expect(res.status).toBe(200)
    expect(res.body.pickupCode).toBe(code)
    expect(res.body.status).toBe('PENDING')
    expect(res.body.contactName).toBe('小美')
    expect(res.body.pickupAt).toBe('10:30')
    expect(res.body.items[0].productName).toBe('可頌')
    expect(res.body.items[0].customNote).toBe('不要太焦')
    // 取貨碼是「攤位-流水號」
    expect(code).toBe('B03-001')
  })

  it('只輸入流水號也查得到（會自動補上自己的攤位前綴）', async () => {
    const ctx = await setupTwoStalls()
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    for (const input of ['1', '001', 'b03-1', 'B03-001']) {
      const res = await request(ctx.app.server)
        .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
        .set('Cookie', ctx.ownerA.cookie)
        .send({ code: input })
      expect(res.status, `輸入「${input}」應查得到`).toBe(200)
      expect(res.body.pickupCode).toBe('B03-001')
    }
  })

  it('別攤的流水號補上自己的前綴後查不到（不會誤查到別攤）', async () => {
    const ctx = await setupTwoStalls()
    // B 攤有一筆 B07-001
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])

    // A 攤輸入「1」→ 會被補成 B03-001，而 A 攤沒有這筆
    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ code: '1' })
    expect(res.status).toBe(404)
  })

  it('小寫輸入也查得到（現場輸入容錯）', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ code: order.subOrders[0].pickupCode.toLowerCase() })

    expect(res.status).toBe(200)
  })

  it('S4-8 / S4-9 別攤的碼與亂碼回完全相同的 404', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])
    const bCode = order.subOrders[0].pickupCode

    // A 拿 B 的碼
    const foreign = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ code: bCode })

    // 完全不存在的碼
    const garbage = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/market-days/${ctx.day.id}/pickup/lookup`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ code: 'ZZ-999' })

    expect(foreign.status).toBe(404)
    expect(garbage.status).toBe(404)
    expect(foreign.body.error).toBe('PICKUP_CODE_NOT_FOUND')
    // 兩者回應必須一模一樣，否則可以用差異探測別攤的碼
    expect(foreign.body).toEqual(garbage.body)
  })
})

describe('S4-10 ~ S4-12 核銷', () => {
  it('S4-10 PENDING → PICKED_UP，記錄時間並發出 order:status', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const subOrderId = order.subOrders[0].id

    const received: unknown[] = []
    const handler = (e: unknown) => received.push(e)
    events.on('order:status', handler)

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)

    events.off('order:status', handler)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('PICKED_UP')
    expect(res.body.pickedUpAt).toBeTruthy()

    const row = await prisma.subOrder.findUnique({ where: { id: subOrderId } })
    expect(row?.status).toBe('PICKED_UP')
    expect(row?.pickedUpAt).not.toBeNull()
    expect(row?.pickedUpByUserId).toBe(ctx.ownerA.id)

    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ subOrderId, status: 'PICKED_UP' })
  })

  it('S4-11 已取貨再核銷 → 409 ALREADY_PICKED_UP 且時間不變', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const subOrderId = order.subOrders[0].id

    const first = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)
    const firstTime = first.body.pickedUpAt

    const second = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(second.status).toBe(409)
    expect(second.body.error).toBe('ALREADY_PICKED_UP')
    expect(second.body.pickedUpAt).toBe(firstTime)

    const row = await prisma.subOrder.findUnique({ where: { id: subOrderId } })
    expect(row?.pickedUpAt?.toISOString()).toBe(firstTime)
  })

  it('S4-12 場次 CLOSED 後不能核銷 → 409', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    await prisma.marketDay.update({
      where: { id: ctx.day.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    })

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${order.subOrders[0].id}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.status).toBe(409)
  })

  it('別攤的子單不能核銷（403）', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${order.subOrders[0].id}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.status).toBe(403)
    expect(await subOrderStatus(order.subOrders[0].id)).toBe('PENDING')
  })

  it('終態不能再轉狀態（04 §B）', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const subOrderId = order.subOrders[0].id

    await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'NO_SHOW' })
      .expect(200)

    const again = await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'CANCELLED' })
    expect(again.status).toBe(409)
    expect(again.body.error).toBe('INVALID_STATE_TRANSITION')

    const pickup = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${subOrderId}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(pickup.status).toBe(409)
  })

  it('只接受 NO_SHOW / CANCELLED，不能直接改成 PICKED_UP', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    const res = await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${order.subOrders[0].id}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'PICKED_UP' })

    expect(res.status).toBe(400)
  })
})

describe('S4-13 場次結案', () => {
  it('2 PENDING + 1 PICKED_UP → { noShowCount: 2 }，狀態正確', async () => {
    const ctx = await setupTwoStalls()
    const buyer2 = await createUser({ role: 'user' })
    const buyer3 = await createUser({ role: 'user' })

    const o1 = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const o2 = await placeOrder(ctx.app, buyer2.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const o3 = await placeOrder(ctx.app, buyer3.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${o3.subOrders[0].id}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)
      .expect(200)

    const res = await request(ctx.app.server)
      .post(`/api/operator/market-days/${ctx.day.id}/close`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.noShowCount).toBe(2)

    expect(await subOrderStatus(o1.subOrders[0].id)).toBe('NO_SHOW')
    expect(await subOrderStatus(o2.subOrders[0].id)).toBe('NO_SHOW')
    expect(await subOrderStatus(o3.subOrders[0].id)).toBe('PICKED_UP')

    const day = await prisma.marketDay.findUnique({ where: { id: ctx.day.id } })
    expect(day?.status).toBe('CLOSED')
    expect(day?.closedAt).not.toBeNull()
  })

  it('結案後子單唯讀', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    await request(ctx.app.server)
      .post(`/api/operator/market-days/${ctx.day.id}/close`)
      .set('Cookie', ctx.operator.cookie)

    const res = await request(ctx.app.server)
      .patch(`/api/stalls/${ctx.stallA.id}/sub-orders/${order.subOrders[0].id}/status`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ status: 'CANCELLED' })

    expect(res.status).toBe(409)
  })
})
