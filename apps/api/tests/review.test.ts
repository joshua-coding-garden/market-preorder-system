/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：
 * 上架審核機制、容量上限、市集停用。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import {
  closeTestApp,
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

async function setup() {
  const app = await getTestApp()
  const operator = await createUser({ role: 'operator' })
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
  return { app, operator, stallUser, market, day, stall, product }
}

/** 攤商把商品上架到某場次 */
function putListings(
  app: Awaited<ReturnType<typeof getTestApp>>,
  cookie: string,
  stallId: string,
  dayId: string,
  items: { productId: string; price: number; maxQty?: number | null }[],
) {
  return request(app.server)
    .put(`/api/stalls/${stallId}/market-days/${dayId}/listings`)
    .set('Cookie', cookie)
    .send(items)
}

describe('系統設定（GET/PATCH /api/operator/settings）', () => {
  it('預設是不需審核、每攤 10 品項、全站 200 攤', async () => {
    const { app, operator } = await setup()
    const res = await request(app.server)
      .get('/api/operator/settings')
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.listingApprovalRequired).toBe(false)
    expect(res.body.maxProductsPerStall).toBe(10)
    expect(res.body.maxStalls).toBe(200)
  })

  it('攤商讀不到也改不了系統設定', async () => {
    const { app, stallUser } = await setup()
    expect(
      (await request(app.server).get('/api/operator/settings').set('Cookie', stallUser.cookie))
        .status,
    ).toBe(403)
    expect(
      (
        await request(app.server)
          .patch('/api/operator/settings')
          .set('Cookie', stallUser.cookie)
          .send({ listingApprovalRequired: true })
      ).status,
    ).toBe(403)
  })

  it('管理員可以開啟審核', async () => {
    const { app, operator } = await setup()
    const res = await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })

    expect(res.status).toBe(200)
    expect(res.body.listingApprovalRequired).toBe(true)
  })
})

describe('上架審核', () => {
  it('審核關閉時：攤商上架直接 APPROVED，顧客馬上看得到', async () => {
    const { app, stallUser, stall, day, product } = await setup()

    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    expect(put.status).toBe(200)
    expect(put.body.items[0].approval).toBe('APPROVED')

    const pub = await request(app.server).get(`/api/market-days/${day.id}/listings`)
    expect(pub.body.items).toHaveLength(1)
  })

  it('審核開啟時：攤商新上架的商品進 PENDING_REVIEW，顧客看不到', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })

    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    expect(put.status).toBe(200)
    expect(put.body.items[0].approval).toBe('PENDING_REVIEW')

    // 顧客端看不到
    const pub = await request(app.server).get(`/api/market-days/${day.id}/listings`)
    expect(pub.body.items).toHaveLength(0)

    // 但攤商自己看得到（才知道在等審核）
    const mine = await request(app.server)
      .get(`/api/stalls/${stall.id}/market-days/${day.id}/listings`)
      .set('Cookie', stallUser.cookie)
    expect(mine.body.items[0].approval).toBe('PENDING_REVIEW')
  })

  it('管理員審核通過後顧客就看得到', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })
    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    const listingId = put.body.items[0].id

    const approve = await request(app.server)
      .post(`/api/operator/listings/${listingId}/approve`)
      .set('Cookie', operator.cookie)
    expect(approve.status).toBe(200)
    expect(approve.body.approval).toBe('APPROVED')

    const pub = await request(app.server).get(`/api/market-days/${day.id}/listings`)
    expect(pub.body.items).toHaveLength(1)
  })

  it('駁回一定要附理由，駁回後顧客仍看不到', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })
    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    const listingId = put.body.items[0].id

    const noReason = await request(app.server)
      .post(`/api/operator/listings/${listingId}/reject`)
      .set('Cookie', operator.cookie)
      .send({})
    expect(noReason.status).toBe(400)

    const rejected = await request(app.server)
      .post(`/api/operator/listings/${listingId}/reject`)
      .set('Cookie', operator.cookie)
      .send({ reason: '照片看不出是什麼商品' })
    expect(rejected.status).toBe(200)
    expect(rejected.body.approval).toBe('REJECTED')
    expect(rejected.body.rejectReason).toBe('照片看不出是什麼商品')

    const pub = await request(app.server).get(`/api/market-days/${day.id}/listings`)
    expect(pub.body.items).toHaveLength(0)
  })

  it('待審清單只列出等待中的，攤商叫不動這支端點', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })
    await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])

    const queue = await request(app.server)
      .get('/api/operator/listings?approval=PENDING_REVIEW')
      .set('Cookie', operator.cookie)
    expect(queue.status).toBe(200)
    expect(queue.body.items).toHaveLength(1)
    expect(queue.body.items[0].stall.name).toBe('小麥麵包')
    expect(queue.body.items[0].product.name).toBe('可頌')

    expect(
      (await request(app.server).get('/api/operator/listings').set('Cookie', stallUser.cookie))
        .status,
    ).toBe(403)
  })

  it('已通過的上架再被攤商改價，會重新送審', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ listingApprovalRequired: true })

    const again = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 95 },
    ])
    expect(again.body.items[0].approval).toBe('PENDING_REVIEW')
  })
})

describe('管理員強制上下架', () => {
  it('強制下架後顧客看不到，強制上架會一併視為審核通過', async () => {
    const { app, operator, stallUser, stall, day, product } = await setup()
    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    const listingId = put.body.items[0].id

    const off = await request(app.server)
      .patch(`/api/operator/listings/${listingId}`)
      .set('Cookie', operator.cookie)
      .send({ status: 'OFF_SHELF' })
    expect(off.status).toBe(200)
    expect(off.body.status).toBe('OFF_SHELF')
    expect((await request(app.server).get(`/api/market-days/${day.id}/listings`)).body.items)
      .toHaveLength(0)

    const on = await request(app.server)
      .patch(`/api/operator/listings/${listingId}`)
      .set('Cookie', operator.cookie)
      .send({ status: 'ON_SALE' })
    expect(on.body.status).toBe('ON_SALE')
    expect(on.body.approval).toBe('APPROVED')
    expect((await request(app.server).get(`/api/market-days/${day.id}/listings`)).body.items)
      .toHaveLength(1)
  })

  it('攤商不能叫管理員的強制上下架端點', async () => {
    const { app, stallUser, stall, day, product } = await setup()
    const put = await putListings(app, stallUser.cookie, stall.id, day.id, [
      { productId: product.id, price: 80 },
    ])
    const res = await request(app.server)
      .patch(`/api/operator/listings/${put.body.items[0].id}`)
      .set('Cookie', stallUser.cookie)
      .send({ status: 'OFF_SHELF' })
    expect(res.status).toBe(403)
  })
})

describe('容量上限', () => {
  it('每攤品項上限：第 11 個商品被擋下', async () => {
    const { app, stallUser, stall } = await setup()
    // setup 已建了 1 個，再補到 10 個
    for (let i = 2; i <= 10; i += 1) {
      const res = await request(app.server)
        .post(`/api/stalls/${stall.id}/products`)
        .set('Cookie', stallUser.cookie)
        .send({ code: `P${i}`, name: `商品${i}`, basePrice: 50 })
      expect(res.status).toBe(201)
    }

    const over = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', stallUser.cookie)
      .send({ code: 'P11', name: '第十一個', basePrice: 50 })
    expect(over.status).toBe(409)
    expect(over.body.error).toBe('PRODUCT_LIMIT_REACHED')
    expect(await prisma.product.count({ where: { stallId: stall.id } })).toBe(10)
  })

  it('下架的商品不佔品項額度', async () => {
    const { app, stallUser, stall, product } = await setup()
    for (let i = 2; i <= 10; i += 1) {
      await request(app.server)
        .post(`/api/stalls/${stall.id}/products`)
        .set('Cookie', stallUser.cookie)
        .send({ code: `P${i}`, name: `商品${i}`, basePrice: 50 })
    }
    await request(app.server)
      .delete(`/api/stalls/${stall.id}/products/${product.id}`)
      .set('Cookie', stallUser.cookie)

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', stallUser.cookie)
      .send({ code: 'P11', name: '補位', basePrice: 50 })
    expect(res.status).toBe(201)
  })

  it('上限可由管理員調整', async () => {
    const { app, operator, stallUser, stall } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ maxProductsPerStall: 1 })

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', stallUser.cookie)
      .send({ code: 'P2', name: '第二個', basePrice: 50 })
    expect(res.status).toBe(409)
  })

  it('攤商總數上限：超過就不能再開新攤', async () => {
    const { app, operator } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ maxStalls: 1 })

    const res = await request(app.server)
      .post('/api/operator/stalls')
      .set('Cookie', operator.cookie)
      .send({ name: '第二攤' })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe('STALL_LIMIT_REACHED')
  })

  it('停用的攤商不佔攤商額度', async () => {
    const { app, operator, stall } = await setup()
    await request(app.server)
      .patch('/api/operator/settings')
      .set('Cookie', operator.cookie)
      .send({ maxStalls: 1 })
    await request(app.server)
      .patch(`/api/operator/stalls/${stall.id}`)
      .set('Cookie', operator.cookie)
      .send({ isActive: false })

    const res = await request(app.server)
      .post('/api/operator/stalls')
      .set('Cookie', operator.cookie)
      .send({ name: '接替的攤' })
    expect(res.status).toBe(201)
  })
})

describe('市集停用', () => {
  it('停用後顧客端場次列表看不到該市集的場次', async () => {
    const { app, operator, market, day } = await setup()
    expect((await request(app.server).get('/api/market-days')).body.items).toHaveLength(1)

    const res = await request(app.server)
      .patch(`/api/operator/markets/${market.id}`)
      .set('Cookie', operator.cookie)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)

    expect((await request(app.server).get('/api/market-days')).body.items).toHaveLength(0)
    expect((await request(app.server).get(`/api/market-days/${day.id}`)).status).toBe(404)
  })

  it('停用的市集不能再開新場次', async () => {
    const { app, operator, market } = await setup()
    await request(app.server)
      .patch(`/api/operator/markets/${market.id}`)
      .set('Cookie', operator.cookie)
      .send({ isActive: false })

    const res = await request(app.server)
      .post('/api/operator/market-days')
      .set('Cookie', operator.cookie)
      .send({
        marketId: market.id,
        eventDate: '2099-11-11',
        openTime: '09:00',
        closeTime: '15:00',
        orderDeadline: '2099-11-10T15:59:59.000Z',
      })
    expect(res.status).toBe(409)
  })

  it('恢復後又看得到了', async () => {
    const { app, operator, market } = await setup()
    await request(app.server)
      .patch(`/api/operator/markets/${market.id}`)
      .set('Cookie', operator.cookie)
      .send({ isActive: false })
    await request(app.server)
      .patch(`/api/operator/markets/${market.id}`)
      .set('Cookie', operator.cookie)
      .send({ isActive: true })

    expect((await request(app.server).get('/api/market-days')).body.items).toHaveLength(1)
  })
})

describe('攤商自助維護基本資料', () => {
  it('攤商看得到也改得動自己的基本資料', async () => {
    const { app, stallUser, stall } = await setup()

    const get = await request(app.server)
      .get(`/api/stalls/${stall.id}`)
      .set('Cookie', stallUser.cookie)
    expect(get.status).toBe(200)
    expect(get.body.name).toBe('小麥麵包')

    const patch = await request(app.server)
      .patch(`/api/stalls/${stall.id}`)
      .set('Cookie', stallUser.cookie)
      .send({ description: '每天現烤', contactName: '王小麥', contactPhone: '0912345678' })
    expect(patch.status).toBe(200)
    expect(patch.body.description).toBe('每天現烤')
    expect(patch.body.contactPhone).toBe('0912345678')
  })

  it('攤商不能改別攤的資料', async () => {
    const { app, stallUser } = await setup()
    const other = await createStall('別攤')

    const res = await request(app.server)
      .patch(`/api/stalls/${other.id}`)
      .set('Cookie', stallUser.cookie)
      .send({ name: '被我改掉' })
    expect(res.status).toBe(403)
    expect((await prisma.stall.findUnique({ where: { id: other.id } }))?.name).toBe('別攤')
  })

  it('攤商不能自己把自己停用或改名成空字串', async () => {
    const { app, stallUser, stall } = await setup()
    const res = await request(app.server)
      .patch(`/api/stalls/${stall.id}`)
      .set('Cookie', stallUser.cookie)
      .send({ isActive: false })
    expect(res.status).toBe(400)
    expect((await prisma.stall.findUnique({ where: { id: stall.id } }))?.isActive).toBe(true)
  })
})
