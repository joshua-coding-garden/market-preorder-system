/**
 * 07-驗收條件.md §S6：S6-1 ~ S6-8（推播審核，04 §E 推播段、D-09）
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { closeTestApp, createUser, resetDb } from './helpers.js'
import { placeOrder, setupTwoStalls } from './fixtures.js'
import { installMockLine, uninstallMockLine } from './lineMock.js'

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  uninstallMockLine()
})

afterAll(async () => {
  await closeTestApp()
})

describe('S6-1 ~ S6-3 攤商申請', () => {
  it('S6-1 STALL_COMPOSE 缺 bodyText → 400', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'STALL_COMPOSE', title: '只有標題' })

    expect(res.status).toBe(400)
    expect(await prisma.broadcast.count()).toBe(0)
  })

  it('S6-1 缺 title 也 400', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'STALL_COMPOSE', bodyText: '只有內容' })

    expect(res.status).toBe(400)
  })

  it('S6-2 STALL_COMPOSE 完整 → 201 且 status=PENDING_REVIEW', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({
        composeMode: 'STALL_COMPOSE',
        title: '本週新品',
        bodyText: '可頌買二送一',
        marketDayId: ctx.day.id,
        audience: 'STALL_CUSTOMERS',
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('PENDING_REVIEW')
    expect(res.body.stallId).toBe(ctx.stallA.id)
  })

  it('S6-3 OPERATOR_COMPOSE → 201 且 status=DRAFT', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'OPERATOR_COMPOSE', marketDayId: ctx.day.id })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe('DRAFT')
  })
})

describe('S6-4 / S6-5 審核', () => {
  async function createPending(ctx: Awaited<ReturnType<typeof setupTwoStalls>>) {
    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({
        composeMode: 'STALL_COMPOSE',
        title: '本週新品',
        bodyText: '可頌買二送一',
        marketDayId: ctx.day.id,
        audience: 'MARKET_DAY_CUSTOMERS',
      })
    return res.body.id as string
  }

  it('S6-4 退回沒填 reason → 400', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const id = await createPending(ctx)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${id}/reject`)
      .set('Cookie', ctx.operator.cookie)
      .send({})

    expect(res.status).toBe(400)
    const b = await prisma.broadcast.findUnique({ where: { id } })
    expect(b?.status).toBe('PENDING_REVIEW')
  })

  it('S6-4 有 reason → REJECTED 且原因存起來', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const id = await createPending(ctx)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${id}/reject`)
      .set('Cookie', ctx.operator.cookie)
      .send({ reason: '文案有誤導性，請修改' })

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('REJECTED')
    expect(res.body.rejectReason).toBe('文案有誤導性，請修改')

    // 攤商端看得到退回原因
    const list = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(list.body.items[0].rejectReason).toBe('文案有誤導性，請修改')
  })

  it('S6-5 approve → APPROVED', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const id = await createPending(ctx)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${id}/approve`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('APPROVED')
    expect(res.body.reviewedAt).toBeTruthy()
  })

  it('已 REJECTED 的不能再核准', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const id = await createPending(ctx)
    await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${id}/reject`)
      .set('Cookie', ctx.operator.cookie)
      .send({ reason: '不行' })

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${id}/approve`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(409)
  })
})

describe('S6-6 / S6-7 送出前置條件', () => {
  it('S6-6 DRAFT 直接 send → 409 INVALID_STATE_TRANSITION', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    const created = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'OPERATOR_COMPOSE', marketDayId: ctx.day.id })

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('INVALID_STATE_TRANSITION')
    expect(line.totalRecipients()).toBe(0)
  })

  it('S6-7 APPROVED 但額度不足 → 409 QUOTA_EXCEEDED，狀態仍 APPROVED 且無 push', async () => {
    const line = installMockLine({ consumption: 200, quota: 200 })
    const ctx = await setupTwoStalls()
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    line.reset()

    const created = await request(ctx.app.server)
      .post('/api/operator/broadcasts')
      .set('Cookie', ctx.operator.cookie)
      .send({
        composeMode: 'OPERATOR_COMPOSE',
        bodyText: '市集開始囉',
        marketDayId: ctx.day.id,
        audience: 'MARKET_DAY_CUSTOMERS',
      })
    expect(created.body.status).toBe('APPROVED')

    const estimate = await request(ctx.app.server)
      .get(`/api/operator/broadcasts/${created.body.id}/estimate`)
      .set('Cookie', ctx.operator.cookie)
    expect(estimate.body.allowed).toBe(false)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('QUOTA_EXCEEDED')
    expect(line.totalRecipients()).toBe(0)

    const b = await prisma.broadcast.findUnique({ where: { id: created.body.id } })
    expect(b?.status).toBe('APPROVED')
    expect(b?.sentAt).toBeNull()
  })
})

describe('S6-8 送出', () => {
  it('MARKET_DAY_CUSTOMERS：3 位顧客 → multicast 1 次 3 人、SENT、recipient_count=3、3 筆 notification', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()

    const buyers = [
      ctx.customer,
      await createUser({ role: 'user' }),
      await createUser({ role: 'user' }),
    ]
    for (const b of buyers) {
      await placeOrder(ctx.app, b.cookie, ctx.day.id, [
        { listingId: ctx.listings.toast.id, qty: 1 },
      ])
    }
    line.reset()

    const created = await request(ctx.app.server)
      .post('/api/operator/broadcasts')
      .set('Cookie', ctx.operator.cookie)
      .send({
        composeMode: 'OPERATOR_COMPOSE',
        title: '提醒',
        bodyText: '今天記得來取貨',
        marketDayId: ctx.day.id,
        audience: 'MARKET_DAY_CUSTOMERS',
      })

    const estimate = await request(ctx.app.server)
      .get(`/api/operator/broadcasts/${created.body.id}/estimate`)
      .set('Cookie', ctx.operator.cookie)
    expect(estimate.body.recipients).toBe(3)
    expect(estimate.body.allowed).toBe(true)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('SENT')
    expect(res.body.recipientCount).toBe(3)
    expect(res.body.sentAt).toBeTruthy()

    expect(line.calls.multicast).toHaveLength(1)
    expect(line.calls.multicast[0].to).toHaveLength(3)

    const notifications = await prisma.notification.findMany({
      where: { kind: 'BROADCAST', refId: created.body.id },
    })
    expect(notifications).toHaveLength(3)
    expect(notifications.every((n) => n.status === 'SENT')).toBe(true)
  })

  it('STALL_CUSTOMERS 只送給向該攤下單的顧客', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    const buyerA = ctx.customer
    const buyerB = await createUser({ role: 'user' })

    await placeOrder(ctx.app, buyerA.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    await placeOrder(ctx.app, buyerB.cookie, ctx.day.id, [
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])
    line.reset()

    const created = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({
        composeMode: 'STALL_COMPOSE',
        title: '小麥麵包',
        bodyText: '今天加碼送',
        marketDayId: ctx.day.id,
        audience: 'STALL_CUSTOMERS',
      })
    await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/approve`)
      .set('Cookie', ctx.operator.cookie)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.recipientCount).toBe(1)
    expect(line.calls.push).toHaveLength(1)
  })

  it('ALL_FRIENDS 走 broadcast API', async () => {
    const line = installMockLine({ followers: 42 })
    const ctx = await setupTwoStalls()

    const created = await request(ctx.app.server)
      .post('/api/operator/broadcasts')
      .set('Cookie', ctx.operator.cookie)
      .send({
        composeMode: 'OPERATOR_COMPOSE',
        title: '週末見',
        bodyText: '本週市集照常舉行',
        audience: 'ALL_FRIENDS',
      })

    const estimate = await request(ctx.app.server)
      .get(`/api/operator/broadcasts/${created.body.id}/estimate`)
      .set('Cookie', ctx.operator.cookie)
    expect(estimate.body.recipients).toBe(42)

    const res = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(res.status).toBe(200)
    expect(line.calls.broadcast).toHaveLength(1)
    expect(line.calls.multicast).toHaveLength(0)
  })

  it('送出後是終態，不能再送', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const created = await request(ctx.app.server)
      .post('/api/operator/broadcasts')
      .set('Cookie', ctx.operator.cookie)
      .send({ composeMode: 'OPERATOR_COMPOSE', bodyText: 'x', audience: 'ALL_FRIENDS' })
    await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    const again = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.operator.cookie)

    expect(again.status).toBe(409)
  })
})

describe('S6-9 攤商隔離', () => {
  it('攤商 A 讀攤商 B 的推播 → 403', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallB.id}/broadcasts`)
      .set('Cookie', ctx.ownerB.cookie)
      .send({ composeMode: 'STALL_COMPOSE', title: 'B 的機密文案', bodyText: 'xxx' })

    const res = await request(ctx.app.server)
      .get(`/api/stalls/${ctx.stallB.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)

    expect(res.status).toBe(403)
    expect(JSON.stringify(res.body)).not.toContain('B 的機密文案')
  })

  it('攤商 A 不能幫攤商 B 建立推播', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()

    const res = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallB.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'STALL_COMPOSE', title: 't', bodyText: 'b' })

    expect(res.status).toBe(403)
    expect(await prisma.broadcast.count()).toBe(0)
  })

  it('攤商不能自己核准或送出', async () => {
    installMockLine()
    const ctx = await setupTwoStalls()
    const created = await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/broadcasts`)
      .set('Cookie', ctx.ownerA.cookie)
      .send({ composeMode: 'STALL_COMPOSE', title: 't', bodyText: 'b' })

    const approve = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/approve`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(approve.status).toBe(403)

    const send = await request(ctx.app.server)
      .post(`/api/operator/broadcasts/${created.body.id}/send`)
      .set('Cookie', ctx.ownerA.cookie)
    expect(send.status).toBe(403)
  })
})
