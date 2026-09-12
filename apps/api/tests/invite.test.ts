/**
 * 07-驗收條件.md §S1：S1-5 ~ S1-9、S1-11
 * 另涵蓋邀請碼產碼格式與流水號（S1-3／S1-4 的自動化部分）。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { inviteExpire, inviteRecycle } from '../src/jobs/inviteJobs.js'
import { INVITE_RECYCLE_DAYS } from '../src/lib/inviteCode.js'
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

/** 建一個場次 + 一個攤商 + 一個 participation（含自動產生的邀請碼） */
async function setupParticipation(opts: { eventDate?: string; boothNo?: string } = {}) {
  const app = await getTestApp()
  const operator = await createUser({ role: 'operator' })
  const market = await createMarket('A')
  const day = await createMarketDay({
    marketId: market.id,
    status: 'DRAFT',
    eventDate: opts.eventDate ?? '2099-09-12',
  })
  const stall = await createStall('小麥麵包')

  const res = await request(app.server)
    .post(`/api/operator/market-days/${day.id}/participations`)
    .set('Cookie', operator.cookie)
    .send({ stallId: stall.id, boothNo: opts.boothNo ?? 'B03' })

  expect(res.status).toBe(201)
  return { app, operator, market, day, stall, body: res.body }
}

describe('邀請碼產生（D-03 / 04 §C）', () => {
  it('格式為 {市集代號}{YYYYMMDD}-{4 位流水號}，從 0001 起', async () => {
    const { body, day } = await setupParticipation({ eventDate: '2099-09-12' })

    expect(body.inviteCode.code).toBe('A20990912-0001')
    expect(body.inviteCode.status).toBe('ACTIVE')

    // expires_at = 場次當天 23:59:59 台北 = 15:59:59 UTC
    expect(body.inviteCode.expiresAt).toBe('2099-09-12T15:59:59.000Z')
    // recyclable_at = expires_at + 60 天
    const expires = new Date(body.inviteCode.expiresAt).getTime()
    const recyclable = new Date(body.inviteCode.recyclableAt).getTime()
    expect(recyclable - expires).toBe(INVITE_RECYCLE_DAYS * 24 * 60 * 60 * 1000)
    expect(day).toBeTruthy()
  })

  it('同場次第二攤的流水號遞增為 0002（S1-4）', async () => {
    const { app, operator, day } = await setupParticipation()
    const stall2 = await createStall('山上咖啡')

    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/participations`)
      .set('Cookie', operator.cookie)
      .send({ stallId: stall2.id, boothNo: 'B07' })

    expect(res.status).toBe(201)
    expect(res.body.inviteCode.code).toBe('A20990912-0002')
  })

  it('同場次重複攤位號回 409（S1-4）', async () => {
    const { app, operator, day } = await setupParticipation({ boothNo: 'B03' })
    const stall2 = await createStall('山上咖啡')

    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/participations`)
      .set('Cookie', operator.cookie)
      .send({ stallId: stall2.id, boothNo: 'B03' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('CONFLICT')
  })

  it('reissue 會把舊碼改 EXPIRED 並發出流水號遞增的新碼', async () => {
    const { app, operator, body } = await setupParticipation()
    const participationId = body.participation.id

    const res = await request(app.server)
      .post(`/api/operator/participations/${participationId}/invite-codes/reissue`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.code).toBe('A20990912-0002')
    expect(res.body.status).toBe('ACTIVE')

    const old = await prisma.inviteCode.findFirst({ where: { code: 'A20990912-0001' } })
    expect(old?.status).toBe('EXPIRED')

    // uq_invite_code_active：一個 participation 同時只有一張 ACTIVE
    const activeCount = await prisma.inviteCode.count({
      where: { participationId, status: 'ACTIVE' },
    })
    expect(activeCount).toBe(1)
  })
})

describe('S1-5 兌換邀請碼', () => {
  it('ACTIVE 碼兌換成功：stall_member 多一列，碼變 REDEEMED', async () => {
    const { app, body, stall, day } = await setupParticipation()
    const user = await createUser({ role: 'user' })

    const res = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: body.inviteCode.code })

    expect(res.status).toBe(200)
    expect(res.body.stall.id).toBe(stall.id)
    expect(res.body.boothNo).toBe('B03')
    expect(res.body.marketDay.id).toBe(day.id)

    const member = await prisma.stallMember.findUnique({
      where: { userId_stallId: { userId: user.id, stallId: stall.id } },
    })
    expect(member).not.toBeNull()

    const code = await prisma.inviteCode.findFirst({ where: { code: body.inviteCode.code } })
    expect(code?.status).toBe('REDEEMED')
    expect(code?.redeemedByUserId).toBe(user.id)
    expect(code?.redeemedAt).not.toBeNull()
  })

  it('兌換後 /me 的 capabilities.stall 變成 true', async () => {
    const { app, body } = await setupParticipation()
    const user = await createUser({ role: 'user' })

    const before = await request(app.server).get('/api/me').set('Cookie', user.cookie)
    expect(before.body.capabilities.stall).toBe(false)

    await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: body.inviteCode.code })

    const after = await request(app.server).get('/api/me').set('Cookie', user.cookie)
    expect(after.body.capabilities.stall).toBe(true)
    expect(after.body.stalls).toHaveLength(1)
  })

  it('小寫與空白會被正規化（對應 LINE Bot 的輸入）', async () => {
    const { app, body } = await setupParticipation()
    const user = await createUser({ role: 'user' })

    const res = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: ` ${body.inviteCode.code.toLowerCase()} ` })

    expect(res.status).toBe(200)
  })
})

describe('S1-6 / S1-7 兌換失敗的訊息必須一致', () => {
  it('同一張碼再兌換一次（任何帳號）回 400 INVITE_INVALID', async () => {
    const { app, body } = await setupParticipation()
    const first = await createUser({ role: 'user' })
    const second = await createUser({ role: 'user' })

    const ok = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', first.cookie)
      .send({ code: body.inviteCode.code })
    expect(ok.status).toBe(200)

    const again = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', second.cookie)
      .send({ code: body.inviteCode.code })

    expect(again.status).toBe(400)
    expect(again.body.error).toBe('INVITE_INVALID')
    expect(again.body.message).toBe('邀請碼無效或已使用')
    // 不得洩漏是誰兌換的、屬於哪一攤
    expect(JSON.stringify(again.body)).not.toContain('小麥麵包')
  })

  it('已 EXPIRED 的碼：訊息與「已兌換」完全相同（S1-7）', async () => {
    const { app, body } = await setupParticipation()
    const user = await createUser({ role: 'user' })

    await prisma.inviteCode.updateMany({
      where: { code: body.inviteCode.code },
      data: { status: 'EXPIRED' },
    })

    const expired = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: body.inviteCode.code })

    expect(expired.status).toBe(400)
    expect(expired.body.error).toBe('INVITE_INVALID')
    expect(expired.body.message).toBe('邀請碼無效或已使用')
  })

  it('不存在的碼：訊息同上', async () => {
    const app = await getTestApp()
    const user = await createUser({ role: 'user' })

    const res = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: 'Z20990101-9999' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('INVITE_INVALID')
    expect(res.body.message).toBe('邀請碼無效或已使用')
  })

  it('未登入不能兌換', async () => {
    const { app, body } = await setupParticipation()
    const res = await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .send({ code: body.inviteCode.code })
    expect(res.status).toBe(401)
  })
})

describe('S1-8 inviteExpire job', () => {
  it('expires_at 已過的 ACTIVE 碼會變 EXPIRED', async () => {
    const { body } = await setupParticipation()

    await prisma.inviteCode.updateMany({
      where: { code: body.inviteCode.code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    const result = await inviteExpire()
    expect(result.expired).toBe(1)

    const after = await prisma.inviteCode.findFirst({ where: { code: body.inviteCode.code } })
    expect(after?.status).toBe('EXPIRED')
  })

  it('冪等：再跑一次不會再改到任何一筆', async () => {
    const { body } = await setupParticipation()
    await prisma.inviteCode.updateMany({
      where: { code: body.inviteCode.code },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })

    await inviteExpire()
    const second = await inviteExpire()
    expect(second.expired).toBe(0)
  })
})

describe('S1-9 inviteRecycle job 與字串重用', () => {
  it('recyclable_at 已過 → RECYCLED；之後 reissue 產出相同字串且不違反 unique index', async () => {
    const { app, operator, body } = await setupParticipation()
    const participationId = body.participation.id
    const originalCode = body.inviteCode.code
    expect(originalCode).toBe('A20990912-0001')

    // 讓這張碼過期且已過可回收時間
    await prisma.inviteCode.updateMany({
      where: { code: originalCode },
      data: {
        status: 'EXPIRED',
        expiresAt: new Date(Date.now() - 120_000),
        recyclableAt: new Date(Date.now() - 60_000),
      },
    })

    const recycled = await inviteRecycle()
    expect(recycled.recycled).toBe(1)
    const afterJob = await prisma.inviteCode.findFirst({ where: { code: originalCode } })
    expect(afterJob?.status).toBe('RECYCLED')

    // 回收後同一個 participation 重發，流水號回到 0001，字串與先前相同
    const res = await request(app.server)
      .post(`/api/operator/participations/${participationId}/invite-codes/reissue`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.code).toBe(originalCode)
    expect(res.body.status).toBe('ACTIVE')

    // uq_invite_code_live 只約束「未回收」的碼，因此兩筆同字串可以並存
    const all = await prisma.inviteCode.findMany({ where: { code: originalCode } })
    expect(all).toHaveLength(2)
    expect(all.filter((c) => c.status !== 'RECYCLED')).toHaveLength(1)
  })

  it('REDEEMED 的碼過了可回收時間也會 RECYCLED', async () => {
    const { app, body } = await setupParticipation()
    const user = await createUser({ role: 'user' })

    await request(app.server)
      .post('/api/stall/invite-codes/redeem')
      .set('Cookie', user.cookie)
      .send({ code: body.inviteCode.code })

    await prisma.inviteCode.updateMany({
      where: { code: body.inviteCode.code },
      data: { recyclableAt: new Date(Date.now() - 60_000) },
    })

    const result = await inviteRecycle()
    expect(result.recycled).toBe(1)
    const after = await prisma.inviteCode.findFirst({ where: { code: body.inviteCode.code } })
    expect(after?.status).toBe('RECYCLED')
  })

  it('冪等：再跑一次不會再改到任何一筆', async () => {
    const { body } = await setupParticipation()
    await prisma.inviteCode.updateMany({
      where: { code: body.inviteCode.code },
      data: { status: 'EXPIRED', recyclableAt: new Date(Date.now() - 60_000) },
    })
    await inviteRecycle()
    expect((await inviteRecycle()).recycled).toBe(0)
  })
})

describe('S1-10 / S1-11 場次狀態機（04 §A）', () => {
  it('沒有 participation 不能發布，加了之後可以', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })
    const market = await createMarket('A')
    const day = await createMarketDay({ marketId: market.id, status: 'DRAFT' })

    const tooEarly = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/publish`)
      .set('Cookie', operator.cookie)
    expect(tooEarly.status).toBe(400)

    const stall = await createStall()
    await request(app.server)
      .post(`/api/operator/market-days/${day.id}/participations`)
      .set('Cookie', operator.cookie)
      .send({ stallId: stall.id, boothNo: 'B01' })

    const ok = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/publish`)
      .set('Cookie', operator.cookie)
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('PUBLISHED')

    // 發布後顧客端才看得到
    const list = await request(app.server).get('/api/market-days?from=2000-01-01')
    expect(list.body.items.map((d: { id: string }) => d.id)).toContain(day.id)
  })

  it('S1-11 已有 preorder 的 PUBLISHED 場次不能 unpublish → 409', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })
    const customer = await createUser({ role: 'user' })
    const market = await createMarket('A')
    const day = await createMarketDay({ marketId: market.id, status: 'PUBLISHED' })

    // 沒有訂單時可以 unpublish
    const before = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/unpublish`)
      .set('Cookie', operator.cookie)
    expect(before.status).toBe(200)
    expect(before.body.status).toBe('DRAFT')

    await prisma.marketDay.update({ where: { id: day.id }, data: { status: 'PUBLISHED' } })
    await prisma.preorder.create({
      data: {
        marketDayId: day.id,
        userId: customer.id,
        contactName: '小美',
        contactPhone: '0912345678',
        pickupAt: new Date(Date.UTC(1970, 0, 1, 10, 30)),
        totalAmount: 0,
        idempotencyKey: `test-${Date.now()}`,
      },
    })

    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/unpublish`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('CONFLICT')
  })

  it('close 會把該場 ACTIVE 邀請碼改成 EXPIRED 並回 noShowCount', async () => {
    const { app, operator, day } = await setupParticipation()
    await request(app.server)
      .post(`/api/operator/market-days/${day.id}/publish`)
      .set('Cookie', operator.cookie)

    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/close`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(200)
    expect(res.body.noShowCount).toBe(0)

    const codes = await prisma.inviteCode.findMany({
      where: { participation: { marketDayId: day.id } },
    })
    expect(codes.every((c) => c.status === 'EXPIRED')).toBe(true)

    const closed = await prisma.marketDay.findUnique({ where: { id: day.id } })
    expect(closed?.status).toBe('CLOSED')
    expect(closed?.closedAt).not.toBeNull()
  })

  it('CLOSED 後不能再加攤商（04 §A 唯讀）', async () => {
    const { app, operator, day } = await setupParticipation()
    await request(app.server)
      .post(`/api/operator/market-days/${day.id}/publish`)
      .set('Cookie', operator.cookie)
    await request(app.server)
      .post(`/api/operator/market-days/${day.id}/close`)
      .set('Cookie', operator.cookie)

    const stall2 = await createStall('山上咖啡')
    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/participations`)
      .set('Cookie', operator.cookie)
      .send({ stallId: stall2.id, boothNo: 'B09' })

    expect(res.status).toBe(409)
  })

  it('非法狀態轉換回 409 INVALID_STATE_TRANSITION', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })
    const market = await createMarket('A')
    const day = await createMarketDay({ marketId: market.id, status: 'DRAFT' })

    // DRAFT 不能 close
    const res = await request(app.server)
      .post(`/api/operator/market-days/${day.id}/close`)
      .set('Cookie', operator.cookie)

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('INVALID_STATE_TRANSITION')
  })
})

describe('S1-1 市集代號驗證', () => {
  it('小寫代號被拒（400），大寫成功', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })

    const lower = await request(app.server)
      .post('/api/operator/markets')
      .set('Cookie', operator.cookie)
      .send({ code: 'b', name: '測試市集', location: '台中' })
    expect(lower.status).toBe(400)
    expect(lower.body.error).toBe('VALIDATION')

    const upper = await request(app.server)
      .post('/api/operator/markets')
      .set('Cookie', operator.cookie)
      .send({ code: 'B', name: '測試市集', location: '台中' })
    expect(upper.status).toBe(201)
    expect(upper.body.code).toBe('B')
  })

  it('重複代號回 409', async () => {
    const app = await getTestApp()
    const operator = await createUser({ role: 'operator' })
    await createMarket('A')

    const res = await request(app.server)
      .post('/api/operator/markets')
      .set('Cookie', operator.cookie)
      .send({ code: 'A', name: '另一個市集', location: '台北' })

    expect(res.status).toBe(409)
  })
})
