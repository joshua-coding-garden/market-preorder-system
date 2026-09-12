/**
 * ⚠️ 規格外：帳號密碼註冊／登入（委託方 2026-09-12 指示）。
 * 不在 07-驗收條件.md 內，但這是身分入口，必須有測試。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { hashPassword, verifyPassword } from '../src/lib/localAuth.js'
import { closeTestApp, createUser, getTestApp, resetDb } from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

const GOOD = { username: 'testshop', password: 'secret12345', displayName: '測試小舖' }

describe('密碼雜湊', () => {
  it('同一個密碼每次雜湊結果不同（有隨機 salt），但都驗得過', async () => {
    const a = await hashPassword('secret12345')
    const b = await hashPassword('secret12345')

    expect(a).not.toBe(b)
    expect(await verifyPassword('secret12345', a)).toBe(true)
    expect(await verifyPassword('secret12345', b)).toBe(true)
    expect(await verifyPassword('wrong-password', a)).toBe(false)
  })

  it('雜湊字串壞掉時回 false 而不是拋錯', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })

  it('密碼不會以明文存進資料庫', async () => {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)

    const credential = await prisma.localCredential.findUnique({
      where: { username: GOOD.username },
    })
    expect(credential?.passwordHash).not.toContain(GOOD.password)
    expect(credential?.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })
})

describe('註冊', () => {
  it('成功後直接登入，/me 讀得到', async () => {
    const app = await getTestApp()

    const res = await request(app.server).post('/api/auth/local/register').send(GOOD)
    expect(res.status).toBe(201)

    const cookie = res.headers['set-cookie']
    expect(cookie).toBeTruthy()

    const me = await request(app.server).get('/api/me').set('Cookie', cookie)
    expect(me.status).toBe(200)
    expect(me.body.displayName).toBe('測試小舖')
  })

  it('系統沒有管理員時，第一個註冊者自動成為 operator', async () => {
    const app = await getTestApp()

    const res = await request(app.server).post('/api/auth/local/register').send(GOOD)
    expect(res.body.promotedToOperator).toBe(true)

    const me = await request(app.server)
      .get('/api/me')
      .set('Cookie', res.headers['set-cookie'])
    expect(me.body.role).toBe('operator')
    expect(me.body.capabilities.operator).toBe(true)
  })

  it('已經有管理員時，之後註冊的都是一般使用者', async () => {
    const app = await getTestApp()
    await createUser({ role: 'operator' })

    const res = await request(app.server).post('/api/auth/local/register').send(GOOD)
    expect(res.body.promotedToOperator).toBe(false)

    const me = await request(app.server)
      .get('/api/me')
      .set('Cookie', res.headers['set-cookie'])
    expect(me.body.role).toBe('user')
    expect(me.body.capabilities.operator).toBe(false)
  })

  it('帳號重複回 409', async () => {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)

    const again = await request(app.server)
      .post('/api/auth/local/register')
      .send({ ...GOOD, password: 'different123' })

    expect(again.status).toBe(409)
    expect(await prisma.appUser.count()).toBe(1)
  })

  it('帳號不分大小寫（TestShop 與 testshop 視為同一個）', async () => {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)

    const again = await request(app.server)
      .post('/api/auth/local/register')
      .send({ ...GOOD, username: 'TestShop' })

    expect(again.status).toBe(409)
  })

  it('密碼太短回 400', async () => {
    const app = await getTestApp()

    const res = await request(app.server)
      .post('/api/auth/local/register')
      .send({ username: 'shorty', password: 'abc123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('VALIDATION')
    expect(await prisma.appUser.count()).toBe(0)
  })

  it('帳號含非法字元回 400', async () => {
    const app = await getTestApp()

    for (const username of ['ab', 'has space', 'has-dash', '中文帳號']) {
      const res = await request(app.server)
        .post('/api/auth/local/register')
        .send({ username, password: 'secret12345' })
      expect(res.status, `${username} 應被拒`).toBe(400)
    }
    expect(await prisma.appUser.count()).toBe(0)
  })

  it('沒填顯示名稱時用帳號當顯示名稱', async () => {
    const app = await getTestApp()
    const res = await request(app.server)
      .post('/api/auth/local/register')
      .send({ username: 'noname', password: 'secret12345' })

    const me = await request(app.server)
      .get('/api/me')
      .set('Cookie', res.headers['set-cookie'])
    expect(me.body.displayName).toBe('noname')
  })
})

describe('登入', () => {
  async function register() {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)
    return app
  }

  it('正確帳密可以登入', async () => {
    const app = await register()

    const res = await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: GOOD.username, password: GOOD.password })

    expect(res.status).toBe(200)
    const me = await request(app.server)
      .get('/api/me')
      .set('Cookie', res.headers['set-cookie'])
    expect(me.status).toBe(200)
  })

  it('大小寫不同的帳號也登得進去', async () => {
    const app = await register()

    const res = await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: 'TESTSHOP', password: GOOD.password })

    expect(res.status).toBe(200)
  })

  it('密碼錯與帳號不存在回完全相同的錯誤', async () => {
    const app = await register()

    const wrongPassword = await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: GOOD.username, password: 'wrong-password' })

    const noSuchUser = await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: 'nobody', password: 'wrong-password' })

    expect(wrongPassword.status).toBe(401)
    expect(noSuchUser.status).toBe(401)
    // 不得用回應差異推斷帳號是否存在
    expect(wrongPassword.body).toEqual(noSuchUser.body)
    expect(wrongPassword.body.message).toBe('帳號或密碼不正確')
  })

  it('登入失敗不會發出 session cookie', async () => {
    const app = await register()

    const res = await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: GOOD.username, password: 'wrong-password' })

    const raw = res.headers['set-cookie']
    const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
    const hasSession = cookies.some(
      (c) => c.startsWith('mp_session=') && !c.startsWith('mp_session=;'),
    )
    expect(hasSession).toBe(false)
  })

  it('登入會更新 last_login_at', async () => {
    const app = await register()
    await prisma.appUser.updateMany({ data: { lastLoginAt: null } })

    await request(app.server)
      .post('/api/auth/local/login')
      .send({ username: GOOD.username, password: GOOD.password })
      .expect(200)

    const user = await prisma.appUser.findFirst()
    expect(user?.lastLoginAt).not.toBeNull()
  })
})

describe('與其他機制的整合', () => {
  it('帳密帳號以 local: 前綴存進 line_user_id，不會與 LINE 帳號衝突', async () => {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)

    const user = await prisma.appUser.findFirst()
    expect(user?.lineUserId).toBe('local:testshop')
  })

  it('/auth/providers 會回報 local 可用', async () => {
    const app = await getTestApp()
    const res = await request(app.server).get('/api/auth/providers')
    expect(res.body.local).toBe(true)
  })

  it('刪掉使用者時憑證一併刪除（ON DELETE CASCADE）', async () => {
    const app = await getTestApp()
    await request(app.server).post('/api/auth/local/register').send(GOOD).expect(201)
    const user = await prisma.appUser.findFirst()

    await prisma.appUser.delete({ where: { id: user!.id } })
    expect(await prisma.localCredential.count()).toBe(0)
  })
})
