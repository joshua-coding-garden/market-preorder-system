/**
 * 07-驗收條件.md §S0：S0-3 ~ S0-6
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { SignJWT } from 'jose'
import { config } from '../src/config.js'
import { prisma } from '../src/lib/db.js'
import {
  closeTestApp,
  createMarket,
  createMarketDay,
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

describe('S0-3 未登入存取受保護資源', () => {
  it('無 cookie 時 GET /api/me 回 401', async () => {
    const app = await getTestApp()
    const res = await request(app.server).get('/api/me')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHENTICATED')
  })

  it('無 cookie 時 GET /api/operator/markets 回 401', async () => {
    const app = await getTestApp()
    const res = await request(app.server).get('/api/operator/markets')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHENTICATED')
  })
})

describe('S0-4 一般使用者存取廠商 API', () => {
  it('role=user 時 GET /api/operator/markets 回 403 且 body 無資料', async () => {
    const app = await getTestApp()
    const user = await createUser({ role: 'user' })
    // 資料庫裡確實有市集，確認 403 不是因為查不到資料
    await createMarket('A')

    const res = await request(app.server)
      .get('/api/operator/markets')
      .set('Cookie', user.cookie)

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('FORBIDDEN')
    // 403 回應體不得含任何目標資源資料（03 §前言）
    expect(res.body.items).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('測試市集')
  })

  it('role=operator 時同一端點回 200', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })
    await createMarket('A')

    const res = await request(app.server)
      .get('/api/operator/markets')
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].code).toBe('A')
  })
})

describe('S0-5 偽造 JWT', () => {
  it('錯簽章的 JWT 回 401', async () => {
    const app = await getTestApp()
    const user = await createUser({ role: 'operator' })

    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('market-preorder')
      .setAudience('market-preorder-web')
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode('a-completely-different-secret-key-32ch'))

    const res = await request(app.server)
      .get('/api/me')
      .set('Cookie', `${config.sessionCookieName}=${forged}`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHENTICATED')
  })

  it('內容被竄改的 cookie 回 401', async () => {
    const app = await getTestApp()
    const res = await request(app.server)
      .get('/api/me')
      .set('Cookie', `${config.sessionCookieName}=not.a.jwt`)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('UNAUTHENTICATED')
  })
})

describe('S0-6 場次列表只回 PUBLISHED', () => {
  it('GET /api/market-days 不含 DRAFT 與 CLOSED', async () => {
    const app = await getTestApp()
    const market = await createMarket('A')
    const published = await createMarketDay({
      marketId: market.id,
      status: 'PUBLISHED',
      eventDate: '2099-01-01',
    })
    const draft = await createMarketDay({
      marketId: market.id,
      status: 'DRAFT',
      eventDate: '2099-01-02',
    })
    const closed = await createMarketDay({
      marketId: market.id,
      status: 'CLOSED',
      eventDate: '2099-01-03',
    })

    const res = await request(app.server).get('/api/market-days')

    expect(res.status).toBe(200)
    const ids = res.body.items.map((d: { id: string }) => d.id)
    expect(ids).toContain(published.id)
    expect(ids).not.toContain(draft.id)
    expect(ids).not.toContain(closed.id)
    for (const day of res.body.items) {
      expect(day.status).toBe('PUBLISHED')
    }
  })

  it('DRAFT 場次詳情對顧客回 404，對 operator 回 200', async () => {
    const app = await getTestApp()
    const market = await createMarket('A')
    const draft = await createMarketDay({
      marketId: market.id,
      status: 'DRAFT',
      eventDate: '2099-02-01',
    })
    const customer = await createUser({ role: 'user' })
    const operator = await createUser({ role: 'operator' })

    const anon = await request(app.server).get(`/api/market-days/${draft.id}`)
    expect(anon.status).toBe(404)

    const asCustomer = await request(app.server)
      .get(`/api/market-days/${draft.id}`)
      .set('Cookie', customer.cookie)
    expect(asCustomer.status).toBe(404)

    const asOperator = await request(app.server)
      .get(`/api/market-days/${draft.id}`)
      .set('Cookie', operator.cookie)
    expect(asOperator.status).toBe(200)
    expect(asOperator.body.status).toBe('DRAFT')
  })

  it('已發布場次詳情含攤商與攤位號', async () => {
    const app = await getTestApp()
    const market = await createMarket('A')
    const day = await createMarketDay({
      marketId: market.id,
      status: 'PUBLISHED',
      eventDate: '2099-03-01',
    })
    const stall = await createStall('小麥麵包')
    await prisma.participation.create({
      data: { marketDayId: day.id, stallId: stall.id, boothNo: 'B03' },
    })

    const res = await request(app.server).get(`/api/market-days/${day.id}`)

    expect(res.status).toBe(200)
    expect(res.body.eventDate).toBe('2099-03-01')
    expect(res.body.openTime).toBe('09:00')
    expect(res.body.closeTime).toBe('15:00')
    expect(res.body.stallCount).toBe(1)
    expect(res.body.participations[0].boothNo).toBe('B03')
    expect(res.body.participations[0].stall.name).toBe('小麥麵包')
  })
})
