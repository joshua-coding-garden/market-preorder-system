import request from 'supertest'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../src/lib/db.js'
import {
  createListing,
  createMarket,
  createMarketDay,
  createParticipation,
  createProduct,
  createStall,
  createUser,
  getTestApp,
  joinStall,
} from './helpers.js'

/**
 * 兩攤商 + 一個場次的共用情境，給 Sprint 4 之後的測試使用。
 * A：小麥麵包（可頌含內容物、吐司），B：山上咖啡（掛耳包）
 */
export async function setupTwoStalls() {
  const app = await getTestApp()
  const operator = await createUser({ role: 'operator' })
  const customer = await createUser({ role: 'user' })
  const ownerA = await createUser({ role: 'user' })
  const ownerB = await createUser({ role: 'user' })

  const market = await createMarket('A')
  const day = await createMarketDay({
    marketId: market.id,
    status: 'PUBLISHED',
    openTime: '09:00',
    closeTime: '15:00',
  })

  const stallA = await createStall('小麥麵包')
  const stallB = await createStall('山上咖啡')
  await joinStall(ownerA.id, stallA.id)
  await joinStall(ownerB.id, stallB.id)
  await createParticipation(day.id, stallA.id, 'B03')
  await createParticipation(day.id, stallB.id, 'B07')

  const croissant = await createProduct({
    stallId: stallA.id,
    code: 'CR01',
    name: '可頌',
    basePrice: 80,
    components: [
      { name: '加起司', extraPrice: 10 },
      { name: '加火腿', extraPrice: 15 },
    ],
  })
  const toast = await createProduct({
    stallId: stallA.id,
    code: 'TS01',
    name: '全麥吐司',
    basePrice: 120,
  })
  const drip = await createProduct({
    stallId: stallB.id,
    code: 'DB01',
    name: '掛耳包',
    basePrice: 250,
  })

  const listings = {
    croissant: await createListing({
      marketDayId: day.id,
      productId: croissant.id,
      stallId: stallA.id,
      price: 80,
    }),
    toast: await createListing({
      marketDayId: day.id,
      productId: toast.id,
      stallId: stallA.id,
      price: 120,
    }),
    drip: await createListing({
      marketDayId: day.id,
      productId: drip.id,
      stallId: stallB.id,
      price: 250,
    }),
  }

  return {
    app,
    operator,
    customer,
    ownerA,
    ownerB,
    market,
    day,
    stallA,
    stallB,
    products: { croissant, toast, drip },
    listings,
  }
}

/** 幫某個顧客下一筆單，回傳建立的訂單 body */
export async function placeOrder(
  app: FastifyInstance,
  cookie: string,
  dayId: string,
  items: { listingId: string; qty: number; componentIds?: string[]; note?: string }[],
  overrides: Record<string, unknown> = {},
) {
  for (const item of items) {
    const res = await request(app.server)
      .post('/api/cart/items')
      .set('Cookie', cookie)
      .send({
        marketDayId: dayId,
        listingId: item.listingId,
        qty: item.qty,
        components: (item.componentIds ?? []).map((componentId) => ({
          componentId,
          ...(item.note ? { customNote: item.note } : {}),
        })),
      })
    if (res.status >= 400) throw new Error(`加入購物車失敗：${JSON.stringify(res.body)}`)
  }

  const res = await request(app.server)
    .post('/api/orders')
    .set('Cookie', cookie)
    .send({
      marketDayId: dayId,
      contactName: '小美',
      contactPhone: '0912345678',
      pickupAt: '10:30',
      idempotencyKey: randomUUID(),
      ...overrides,
    })
  if (res.status !== 201) throw new Error(`下單失敗：${JSON.stringify(res.body)}`)
  return res.body as {
    id: string
    subOrders: { id: string; stall: { id: string; name: string }; pickupCode: string }[]
  }
}

/** 取某張子單目前的狀態 */
export async function subOrderStatus(subOrderId: string) {
  const so = await prisma.subOrder.findUnique({ where: { id: subOrderId } })
  return so?.status
}
