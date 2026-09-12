/**
 * 07-驗收條件.md §S2：S2-7、S2-9（另含 S2-6／S2-10 的顧客可見性）
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
  const user = await createUser({ role: 'user' })
  const stall = await createStall('小麥麵包')
  await joinStall(user.id, stall.id)

  const market = await createMarket('A')
  const today = await createMarketDay({
    marketId: market.id,
    status: 'PUBLISHED',
    eventDate: '2099-05-02',
  })
  const lastWeek = await createMarketDay({
    marketId: market.id,
    status: 'CLOSED',
    eventDate: '2099-04-25',
  })
  await createParticipation(today.id, stall.id, 'B03')
  await createParticipation(lastWeek.id, stall.id, 'B03')

  const products = await Promise.all([
    createProduct({
      stallId: stall.id,
      code: 'CR01',
      name: '可頌',
      basePrice: 80,
      components: [{ name: '加起司', extraPrice: 10 }],
    }),
    createProduct({ stallId: stall.id, code: 'TS01', name: '吐司', basePrice: 120 }),
    createProduct({ stallId: stall.id, code: 'BG01', name: '貝果', basePrice: 65 }),
  ])

  return { app, user, stall, market, today, lastWeek, products }
}

describe('S2-7 沿用上一場（copy-from）', () => {
  it('上一場 3 個 listing、本場已有 1 個 → { copied: 2, skipped: 1 }', async () => {
    const { app, user, stall, today, lastWeek, products } = await setup()

    for (const p of products) {
      await createListing({
        marketDayId: lastWeek.id,
        productId: p.id,
        stallId: stall.id,
        price: p.basePrice + 5,
        maxQty: 20,
      })
    }
    // 本場已存在其中一個
    await createListing({
      marketDayId: today.id,
      productId: products[0].id,
      stallId: stall.id,
      price: 99,
    })

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/market-days/${today.id}/listings/copy-from`)
      .set('Cookie', user.cookie)
      .send({ sourceDayId: lastWeek.id })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ copied: 2, skipped: 1 })

    // 已存在的那個維持本場原價，不被來源覆蓋
    const kept = await prisma.listing.findFirst({
      where: { marketDayId: today.id, productId: products[0].id },
    })
    expect(kept?.price).toBe(99)

    // 複製過來的沿用來源的價格與上限
    const copied = await prisma.listing.findFirst({
      where: { marketDayId: today.id, productId: products[1].id },
    })
    expect(copied?.price).toBe(products[1].basePrice + 5)
    expect(copied?.maxQty).toBe(20)
  })
})

describe('S2-9 CLOSED 場次唯讀', () => {
  it('PUT listings 到已結案場次回 409', async () => {
    const { app, user, stall, lastWeek, products } = await setup()

    const res = await request(app.server)
      .put(`/api/stalls/${stall.id}/market-days/${lastWeek.id}/listings`)
      .set('Cookie', user.cookie)
      .send([{ productId: products[0].id, price: 80, status: 'ON_SALE' }])

    expect(res.status).toBe(409)
  })

  it('copy-from 到已結案場次也回 409', async () => {
    const { app, user, stall, today, lastWeek } = await setup()

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/market-days/${lastWeek.id}/listings/copy-from`)
      .set('Cookie', user.cookie)
      .send({ sourceDayId: today.id })

    expect(res.status).toBe(409)
  })
})

describe('PUT listings 整組 upsert', () => {
  it('建立與更新，未列出者轉為 OFF_SHELF', async () => {
    const { app, user, stall, today, products } = await setup()

    const first = await request(app.server)
      .put(`/api/stalls/${stall.id}/market-days/${today.id}/listings`)
      .set('Cookie', user.cookie)
      .send([
        { productId: products[0].id, price: 85, maxQty: 30, status: 'ON_SALE' },
        { productId: products[1].id, price: 125, status: 'ON_SALE' },
      ])

    expect(first.status).toBe(200)
    expect(first.body.items).toHaveLength(2)

    // 第二次只留一個 → 另一個被下架
    const second = await request(app.server)
      .put(`/api/stalls/${stall.id}/market-days/${today.id}/listings`)
      .set('Cookie', user.cookie)
      .send([{ productId: products[0].id, price: 90, maxQty: 10, status: 'ON_SALE' }])

    expect(second.status).toBe(200)
    const offShelf = await prisma.listing.findFirst({
      where: { marketDayId: today.id, productId: products[1].id },
    })
    expect(offShelf?.status).toBe('OFF_SHELF')

    const updated = await prisma.listing.findFirst({
      where: { marketDayId: today.id, productId: products[0].id },
    })
    expect(updated?.price).toBe(90)
    expect(updated?.maxQty).toBe(10)
  })

  it('不能把別攤的商品上架到自己的場次', async () => {
    const { app, user, stall, today } = await setup()
    const otherStall = await createStall('山上咖啡')
    const otherProduct = await createProduct({
      stallId: otherStall.id,
      code: 'DB01',
      name: '掛耳包',
      basePrice: 250,
    })

    const res = await request(app.server)
      .put(`/api/stalls/${stall.id}/market-days/${today.id}/listings`)
      .set('Cookie', user.cookie)
      .send([{ productId: otherProduct.id, price: 250, status: 'ON_SALE' }])

    expect(res.status).toBe(404)
  })
})

describe('S2-6 / S2-10 顧客可見的本場商品（Q1）', () => {
  it('只回 PUBLISHED 場次；OFF_SHELF 看不到、SOLD_OUT 看得到', async () => {
    const { app, stall, today, products } = await setup()

    await createListing({
      marketDayId: today.id,
      productId: products[0].id,
      stallId: stall.id,
      price: 85,
      status: 'ON_SALE',
    })
    await createListing({
      marketDayId: today.id,
      productId: products[1].id,
      stallId: stall.id,
      price: 120,
      status: 'SOLD_OUT',
    })
    await createListing({
      marketDayId: today.id,
      productId: products[2].id,
      stallId: stall.id,
      price: 65,
      status: 'OFF_SHELF',
    })

    const res = await request(app.server).get(`/api/market-days/${today.id}/listings`)

    expect(res.status).toBe(200)
    const names = res.body.items.map((l: { name: string }) => l.name)
    expect(names).toContain('可頌')
    expect(names).toContain('吐司')
    expect(names).not.toContain('貝果')

    const soldOut = res.body.items.find((l: { name: string }) => l.name === '吐司')
    expect(soldOut.status).toBe('SOLD_OUT')

    // 攤商名稱與攤位號要跟著出來（C2 顯示用）
    const croissant = res.body.items.find((l: { name: string }) => l.name === '可頌')
    expect(croissant.stall.name).toBe('小麥麵包')
    expect(croissant.stall.boothNo).toBe('B03')
    expect(croissant.price).toBe(85)
    expect(croissant.components).toHaveLength(1)
    expect(croissant.components[0].name).toBe('加起司')
  })

  it('停用的商品不出現在顧客端', async () => {
    const { app, stall, today, products } = await setup()
    await createListing({
      marketDayId: today.id,
      productId: products[0].id,
      stallId: stall.id,
      price: 85,
    })
    await prisma.product.update({
      where: { id: products[0].id },
      data: { isActive: false },
    })

    const res = await request(app.server).get(`/api/market-days/${today.id}/listings`)
    expect(res.body.items).toHaveLength(0)
  })

  it('未發布的場次商品一律看不到', async () => {
    const { app, stall, market, products } = await setup()
    const draft = await createMarketDay({
      marketId: market.id,
      status: 'DRAFT',
      eventDate: '2099-06-01',
    })
    await createListing({
      marketDayId: draft.id,
      productId: products[0].id,
      stallId: stall.id,
      price: 85,
    })

    const res = await request(app.server).get(`/api/market-days/${draft.id}/listings`)
    expect(res.status).toBe(404)
  })

  it('可用 stallId 篩選、用 q 搜尋', async () => {
    const { app, stall, today, products } = await setup()
    for (const p of products) {
      await createListing({
        marketDayId: today.id,
        productId: p.id,
        stallId: stall.id,
        price: p.basePrice,
      })
    }

    const byStall = await request(app.server).get(
      `/api/market-days/${today.id}/listings?stallId=${stall.id}`,
    )
    expect(byStall.body.items).toHaveLength(3)

    const bySearch = await request(app.server).get(
      `/api/market-days/${today.id}/listings?q=可頌`,
    )
    expect(bySearch.body.items).toHaveLength(1)
    expect(bySearch.body.items[0].name).toBe('可頌')
  })
})
