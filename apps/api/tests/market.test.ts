/**
 * 規格外：首頁市集入口（GET /markets、GET /market-days?marketId）
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import {
  addDaysIso,
  closeTestApp,
  createMarket,
  createMarketDay,
  getTestApp,
  resetDb,
  todayInTaipei,
} from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

describe('GET /markets', () => {
  it('免登入，依代號排序，只回 id/code/name/location', async () => {
    const app = await getTestApp()
    await createMarket('B', '美村小日子')
    await createMarket('A', '冰町小日子')

    const res = await request(app.server).get('/api/markets')
    expect(res.status).toBe(200)
    expect(res.body.items.map((m: { code: string }) => m.code)).toEqual(['A', 'B'])
    expect(res.body.items[0].name).toBe('冰町小日子')
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['code', 'id', 'location', 'name'])
  })

  it('停用的市集不出現（2026-09-20 的市集停用）', async () => {
    const app = await getTestApp()
    await createMarket('A', '冰町小日子')
    const b = await createMarket('B', '美村小日子')
    await prisma.market.update({ where: { id: b.id }, data: { isActive: false } })

    const res = await request(app.server).get('/api/markets')
    expect(res.body.items.map((m: { code: string }) => m.code)).toEqual(['A'])

    await createMarketDay({ marketId: b.id })
    const days = await request(app.server).get(`/api/market-days?marketId=${b.id}`)
    expect(days.status).toBe(200)
    expect(days.body.items).toEqual([])
  })

  it('沒有市集時回空陣列', async () => {
    const app = await getTestApp()
    const res = await request(app.server).get('/api/markets')
    expect(res.status).toBe(200)
    expect(res.body.items).toEqual([])
  })
})

describe('GET /market-days?marketId', () => {
  it('只回該市集的 PUBLISHED 場次', async () => {
    const app = await getTestApp()
    const a = await createMarket('A', '冰町小日子')
    const b = await createMarket('B', '美村小日子')
    await createMarketDay({ marketId: a.id })
    const dayB = await createMarketDay({ marketId: b.id })
    await createMarketDay({
      marketId: b.id,
      status: 'DRAFT',
      eventDate: addDaysIso(todayInTaipei(), 2),
    })

    const res = await request(app.server).get(`/api/market-days?marketId=${b.id}`)
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].id).toBe(dayB.id)
    expect(res.body.items[0].market.code).toBe('B')

    const all = await request(app.server).get('/api/market-days')
    expect(all.body.items).toHaveLength(2)
  })

  it('marketId 不是 uuid 回 400', async () => {
    const app = await getTestApp()
    const res = await request(app.server).get('/api/market-days?marketId=abc')
    expect(res.status).toBe(400)
  })
})
