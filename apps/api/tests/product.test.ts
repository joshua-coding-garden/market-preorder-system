/**
 * 07-驗收條件.md §S2：S2-2、S2-8（另含內容物整組取代）
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import {
  closeTestApp,
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

async function setupStallUser(name = '小麥麵包') {
  const app = await getTestApp()
  const user = await createUser({ role: 'user' })
  const stall = await createStall(name)
  await joinStall(user.id, stall.id)
  return { app, user, stall }
}

describe('S2-2 商品代碼重複', () => {
  it('同攤重複代碼回 409 PRODUCT_CODE_DUPLICATE', async () => {
    const { app, user, stall } = await setupStallUser()

    const first = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
      .send({ code: 'CR01', name: '可頌', basePrice: 80 })
    expect(first.status).toBe(201)

    const second = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
      .send({ code: 'CR01', name: '另一個可頌', basePrice: 90 })

    expect(second.status).toBe(409)
    expect(second.body.error).toBe('PRODUCT_CODE_DUPLICATE')
  })

  it('不同攤可以用相同代碼', async () => {
    const a = await setupStallUser('小麥麵包')
    const b = await setupStallUser('山上咖啡')

    const first = await request(a.app.server)
      .post(`/api/stalls/${a.stall.id}/products`)
      .set('Cookie', a.user.cookie)
      .send({ code: 'CR01', name: '可頌', basePrice: 80 })
    const second = await request(b.app.server)
      .post(`/api/stalls/${b.stall.id}/products`)
      .set('Cookie', b.user.cookie)
      .send({ code: 'CR01', name: '可頌', basePrice: 85 })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })
})

describe('S2-1 商品與內容物', () => {
  it('建立商品時可一併建立內容物', async () => {
    const { app, user, stall } = await setupStallUser()

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
      .send({
        code: 'CR01',
        name: '可頌',
        basePrice: 80,
        components: [
          { name: '加起司', extraPrice: 10, allowCustomNote: true },
          { name: '加火腿', extraPrice: 15, allowCustomNote: false },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.components).toHaveLength(2)
    expect(res.body.components[0].name).toBe('加起司')
    expect(res.body.components[0].extraPrice).toBe(10)
    expect(res.body.components[1].allowCustomNote).toBe(false)
  })

  it('PUT components 整組取代：未出現的舊 id 變成停用', async () => {
    const { app, user, stall } = await setupStallUser()
    const created = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
      .send({
        code: 'CR01',
        name: '可頌',
        basePrice: 80,
        components: [
          { name: '加起司', extraPrice: 10, allowCustomNote: true },
          { name: '加火腿', extraPrice: 15, allowCustomNote: true },
        ],
      })
    const productId = created.body.id
    const keep = created.body.components[0]

    const res = await request(app.server)
      .put(`/api/stalls/${stall.id}/products/${productId}/components`)
      .set('Cookie', user.cookie)
      .send([
        { id: keep.id, name: '加起司', extraPrice: 12, allowCustomNote: true, sortOrder: 1 },
        { name: '加蛋', extraPrice: 20, allowCustomNote: false, sortOrder: 2 },
      ])

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.items[0].extraPrice).toBe(12)
    expect(res.body.items[1].name).toBe('加蛋')

    // 舊的「加火腿」只是停用，不是刪除（order_item_component 要能追溯）
    const ham = await prisma.productComponent.findFirst({
      where: { productId, name: '加火腿' },
    })
    expect(ham).not.toBeNull()
    expect(ham?.isActive).toBe(false)
  })

  it('刪除商品是軟刪，預設列表看不到但 includeInactive 看得到', async () => {
    const { app, user, stall } = await setupStallUser()
    const created = await request(app.server)
      .post(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
      .send({ code: 'CR01', name: '可頌', basePrice: 80 })

    await request(app.server)
      .delete(`/api/stalls/${stall.id}/products/${created.body.id}`)
      .set('Cookie', user.cookie)
      .expect(204)

    const active = await request(app.server)
      .get(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)
    expect(active.body.items).toHaveLength(0)

    const all = await request(app.server)
      .get(`/api/stalls/${stall.id}/products?includeInactive=true`)
      .set('Cookie', user.cookie)
    expect(all.body.items).toHaveLength(1)
  })
})

describe('S2-8 攤商隔離', () => {
  it('攤商 A 讀攤商 B 的商品回 403，且 body 無 B 的資料', async () => {
    const a = await setupStallUser('小麥麵包')
    const b = await setupStallUser('山上咖啡')

    await request(b.app.server)
      .post(`/api/stalls/${b.stall.id}/products`)
      .set('Cookie', b.user.cookie)
      .send({ code: 'SECRET', name: '機密商品', basePrice: 999 })

    const res = await request(a.app.server)
      .get(`/api/stalls/${b.stall.id}/products`)
      .set('Cookie', a.user.cookie)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
    expect(JSON.stringify(res.body)).not.toContain('機密商品')
  })

  it('攤商 A 不能建立商品到攤商 B', async () => {
    const a = await setupStallUser('小麥麵包')
    const b = await setupStallUser('山上咖啡')

    const res = await request(a.app.server)
      .post(`/api/stalls/${b.stall.id}/products`)
      .set('Cookie', a.user.cookie)
      .send({ code: 'HACK', name: '不該成功', basePrice: 1 })

    expect(res.status).toBe(403)
    const count = await prisma.product.count({ where: { stallId: b.stall.id } })
    expect(count).toBe(0)
  })

  it('operator 可代任何攤商操作（D-01）', async () => {
    const { app, stall } = await setupStallUser()
    const operator = await createUser({ role: 'operator' })

    const res = await request(app.server)
      .get(`/api/stalls/${stall.id}/products`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
  })
})
