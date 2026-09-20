/**
 * 規格外：廠商後台搜尋（GET /operator/stalls 的篩選、GET /operator/products）
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
  resetDb,
} from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

/**
 * 冰町（A）：小麥麵包（王小明）— 可頌 CR01、全麥吐司 TS01（下架）
 * 美村（B）：Coffee House（李阿山，已停用）— 掛耳包 DB01
 */
async function setup() {
  const app = await getTestApp()
  const operator = await createUser({ role: 'operator' })
  const user = await createUser({ role: 'user' })

  const marketA = await createMarket('A', '冰町小日子')
  const marketB = await createMarket('B', '美村小日子')
  const dayA = await createMarketDay({ marketId: marketA.id })
  const dayB = await createMarketDay({ marketId: marketB.id })

  const bread = await createStall('小麥麵包')
  await prisma.stall.update({
    where: { id: bread.id },
    data: { contactName: '王小明', contactPhone: '0911111111' },
  })
  const coffee = await createStall('Coffee House')
  await prisma.stall.update({
    where: { id: coffee.id },
    data: { contactName: '李阿山', isActive: false },
  })
  await createParticipation(dayA.id, bread.id, 'B03')
  await createParticipation(dayB.id, coffee.id, 'B07')

  const cr01 = await createProduct({ stallId: bread.id, code: 'CR01', name: '可頌', basePrice: 80 })
  const ts01 = await createProduct({
    stallId: bread.id,
    code: 'TS01',
    name: '全麥吐司',
    basePrice: 120,
  })
  await prisma.product.update({ where: { id: ts01.id }, data: { isActive: false } })
  const db01 = await createProduct({
    stallId: coffee.id,
    code: 'DB01',
    name: '掛耳包',
    basePrice: 250,
  })

  return { app, operator, user, marketA, marketB, bread, coffee, cr01, ts01, db01 }
}

type StallRow = { id: string; name: string; isActive: boolean; markets: { id: string; name: string }[] }
type ProductRow = { id: string; code: string; stall: { id: string } }

describe('GET /operator/stalls 篩選', () => {
  it('無參數回全部，並附上推導出的所屬市集', async () => {
    const { app, operator, marketA, marketB } = await setup()
    const res = await request(app.server).get('/api/operator/stalls').set('Cookie', operator.cookie)
    expect(res.status).toBe(200)
    const items: StallRow[] = res.body.items
    expect(items.map((s) => s.name)).toEqual(['Coffee House', '小麥麵包'])
    expect(items[0].markets).toEqual([{ id: marketB.id, name: '美村小日子' }])
    expect(items[1].markets).toEqual([{ id: marketA.id, name: '冰町小日子' }])
  })

  it('q 比對攤商名稱', async () => {
    const { app, operator } = await setup()
    const res = await request(app.server)
      .get('/api/operator/stalls?q=麵包')
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((s: StallRow) => s.name)).toEqual(['小麥麵包'])
  })

  it('q 比對聯絡人', async () => {
    const { app, operator } = await setup()
    const res = await request(app.server)
      .get('/api/operator/stalls?q=小明')
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((s: StallRow) => s.name)).toEqual(['小麥麵包'])
  })

  it('q 不分大小寫', async () => {
    const { app, operator } = await setup()
    const res = await request(app.server)
      .get('/api/operator/stalls?q=coffee')
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((s: StallRow) => s.name)).toEqual(['Coffee House'])
  })

  it('marketId 只回參加過該市集的攤商', async () => {
    const { app, operator, marketB } = await setup()
    const res = await request(app.server)
      .get(`/api/operator/stalls?marketId=${marketB.id}`)
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((s: StallRow) => s.name)).toEqual(['Coffee House'])
  })

  it('沒參加過任何場次的攤商，篩市集時不會出現', async () => {
    const { app, operator, marketA } = await setup()
    await createStall('新攤商')
    const res = await request(app.server)
      .get(`/api/operator/stalls?marketId=${marketA.id}`)
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((s: StallRow) => s.name)).toEqual(['小麥麵包'])

    const all = await request(app.server).get('/api/operator/stalls').set('Cookie', operator.cookie)
    const fresh = all.body.items.find((s: StallRow) => s.name === '新攤商')
    expect(fresh.markets).toEqual([])
  })

  it('isActive=false 與 isActive=true', async () => {
    const { app, operator } = await setup()
    const inactive = await request(app.server)
      .get('/api/operator/stalls?isActive=false')
      .set('Cookie', operator.cookie)
    expect(inactive.body.items.map((s: StallRow) => s.name)).toEqual(['Coffee House'])

    const active = await request(app.server)
      .get('/api/operator/stalls?isActive=true')
      .set('Cookie', operator.cookie)
    expect(active.body.items.map((s: StallRow) => s.name)).toEqual(['小麥麵包'])
  })

  it('條件可以疊加', async () => {
    const { app, operator, marketA } = await setup()
    const res = await request(app.server)
      .get(`/api/operator/stalls?q=小明&marketId=${marketA.id}&isActive=true`)
      .set('Cookie', operator.cookie)
    expect(res.body.items).toHaveLength(1)

    const none = await request(app.server)
      .get(`/api/operator/stalls?q=小明&marketId=${marketA.id}&isActive=false`)
      .set('Cookie', operator.cookie)
    expect(none.body.items).toHaveLength(0)
  })

  it('一般使用者 403', async () => {
    const { app, user } = await setup()
    const res = await request(app.server).get('/api/operator/stalls?q=x').set('Cookie', user.cookie)
    expect(res.status).toBe(403)
  })
})

describe('GET /operator/products', () => {
  it('q 比對商品名稱', async () => {
    const { app, operator, cr01 } = await setup()
    const res = await request(app.server)
      .get('/api/operator/products?q=可頌')
      .set('Cookie', operator.cookie)
    expect(res.status).toBe(200)
    expect(res.body.truncated).toBe(false)
    expect(res.body.items.map((p: ProductRow) => p.id)).toEqual([cr01.id])
    expect(res.body.items[0].stall.name).toBe('小麥麵包')
    expect(res.body.items[0].basePrice).toBe(80)
  })

  it('q 比對商品代碼且不分大小寫', async () => {
    const { app, operator, cr01 } = await setup()
    const res = await request(app.server)
      .get('/api/operator/products?q=cr01')
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((p: ProductRow) => p.id)).toEqual([cr01.id])
  })

  it('stallId 回單一攤商全部商品（含下架）', async () => {
    const { app, operator, bread, cr01, ts01 } = await setup()
    const res = await request(app.server)
      .get(`/api/operator/products?stallId=${bread.id}`)
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((p: ProductRow) => p.id)).toEqual([cr01.id, ts01.id])
  })

  it('marketId 只回參加過該市集的攤商的商品', async () => {
    const { app, operator, marketA, marketB, cr01, ts01, db01 } = await setup()
    const a = await request(app.server)
      .get(`/api/operator/products?marketId=${marketA.id}`)
      .set('Cookie', operator.cookie)
    expect(a.body.items.map((p: ProductRow) => p.id)).toEqual([cr01.id, ts01.id])

    const b = await request(app.server)
      .get(`/api/operator/products?marketId=${marketB.id}`)
      .set('Cookie', operator.cookie)
    expect(b.body.items.map((p: ProductRow) => p.id)).toEqual([db01.id])
  })

  it('isActive 篩上架狀態', async () => {
    const { app, operator, ts01 } = await setup()
    const off = await request(app.server)
      .get('/api/operator/products?isActive=false')
      .set('Cookie', operator.cookie)
    expect(off.body.items.map((p: ProductRow) => p.id)).toEqual([ts01.id])

    const on = await request(app.server)
      .get('/api/operator/products?isActive=true')
      .set('Cookie', operator.cookie)
    expect(on.body.items).toHaveLength(2)
  })

  it('stallId 與 q 疊加', async () => {
    const { app, operator, bread, ts01 } = await setup()
    const res = await request(app.server)
      .get(`/api/operator/products?stallId=${bread.id}&q=吐司`)
      .set('Cookie', operator.cookie)
    expect(res.body.items.map((p: ProductRow) => p.id)).toEqual([ts01.id])
  })

  it('無參數依攤商名稱、排序、代碼排列', async () => {
    const { app, operator, cr01, ts01, db01 } = await setup()
    const res = await request(app.server).get('/api/operator/products').set('Cookie', operator.cookie)
    expect(res.body.items.map((p: ProductRow) => p.id)).toEqual([db01.id, cr01.id, ts01.id])
  })

  it('超過 200 筆只回前 200 筆並標 truncated', async () => {
    const { app, operator, coffee } = await setup()
    await prisma.product.createMany({
      data: Array.from({ length: 201 }, (_, i) => ({
        stallId: coffee.id,
        code: `P${String(i + 1).padStart(3, '0')}`,
        name: `商品 ${i + 1}`,
        basePrice: 10,
      })),
    })
    const res = await request(app.server)
      .get(`/api/operator/products?stallId=${coffee.id}`)
      .set('Cookie', operator.cookie)
    expect(res.body.items).toHaveLength(200)
    expect(res.body.truncated).toBe(true)
  })

  it('一般使用者 403', async () => {
    const { app, user } = await setup()
    const res = await request(app.server).get('/api/operator/products').set('Cookie', user.cookie)
    expect(res.status).toBe(403)
  })
})
