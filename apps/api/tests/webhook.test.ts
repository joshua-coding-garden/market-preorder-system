/**
 * 07-驗收條件.md §S5：S5-1 ~ S5-4（LINE webhook，04 §D）
 */
import { createHmac } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import { prisma } from '../src/lib/db.js'
import { config } from '../src/config.js'
import {
  closeTestApp,
  createMarket,
  createMarketDay,
  createStall,
  createUser,
  getTestApp,
  resetDb,
} from './helpers.js'
import { installMockLine, uninstallMockLine, type MockLineClient } from './lineMock.js'

/** 測試用的 channel secret；config 在載入時就固定，所以直接改 process.env 無效 */
const SECRET = config.LINE_MESSAGING_CHANNEL_SECRET

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  uninstallMockLine()
})

afterAll(async () => {
  await closeTestApp()
})

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('base64')
}

async function postWebhook(events: unknown[], signature?: string) {
  const app = await getTestApp()
  const body = JSON.stringify({ destination: 'U0', events })
  return request(app.server)
    .post('/api/line/webhook')
    .set('content-type', 'application/json')
    .set('x-line-signature', signature ?? sign(body))
    .send(body)
}

/** 建一個可兌換的邀請碼 */
async function createInvite(code = 'A20990912-0001') {
  const market = await createMarket('A')
  const day = await createMarketDay({
    marketId: market.id,
    status: 'DRAFT',
    eventDate: '2099-09-12',
  })
  const stall = await createStall('小麥麵包')
  const participation = await prisma.participation.create({
    data: { marketDayId: day.id, stallId: stall.id, boothNo: 'B03' },
  })
  await prisma.inviteCode.create({
    data: {
      participationId: participation.id,
      code,
      expiresAt: new Date('2099-09-12T15:59:59.000Z'),
      recyclableAt: new Date('2099-11-11T15:59:59.000Z'),
    },
  })
  return { stall, day, participation, code }
}

function textEvent(text: string, lineUserId = 'Uwebhooktest1') {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: { type: 'user', userId: lineUserId },
    message: { type: 'text', id: '1', text },
  }
}

describe('S5-1 簽章驗證', () => {
  it('錯誤簽章回 400 且完全不處理事件', async () => {
    installMockLine()
    const res = await postWebhook([textEvent('哈囉')], 'definitely-wrong-signature')

    expect(res.status).toBe(400)
    // 不得因為錯誤簽章而建立任何使用者
    expect(await prisma.appUser.count()).toBe(0)
  })

  it('缺少簽章 header 也回 400', async () => {
    const app = await getTestApp()
    const res = await request(app.server)
      .post('/api/line/webhook')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ events: [] }))

    expect(res.status).toBe(400)
  })

  it('正確簽章回 200', async () => {
    installMockLine()
    const res = await postWebhook([])
    expect(res.status).toBe(200)
  })
})

describe('S5-2 follow 事件', () => {
  it('新增 app_user 並回覆含「本週市集」按鈕的歡迎訊息', async () => {
    const line = installMockLine({ profile: { displayName: '小美' } })

    const res = await postWebhook([
      {
        type: 'follow',
        replyToken: 'reply-token-follow',
        source: { type: 'user', userId: 'Ufollowtest1' },
      },
    ])

    expect(res.status).toBe(200)

    const user = await prisma.appUser.findUnique({ where: { lineUserId: 'Ufollowtest1' } })
    expect(user).not.toBeNull()
    expect(user?.displayName).toBe('小美')

    expect(line.calls.reply).toHaveLength(1)
    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('本週市集')
  })

  it('已存在的使用者不會重複建立', async () => {
    installMockLine()
    await prisma.appUser.create({
      data: { lineUserId: 'Uexisting1', displayName: '原本的名字' },
    })

    await postWebhook([
      { type: 'follow', replyToken: 'r', source: { type: 'user', userId: 'Uexisting1' } },
    ])

    expect(await prisma.appUser.count({ where: { lineUserId: 'Uexisting1' } })).toBe(1)
  })
})

describe('S5-3 邀請碼文字綁定', () => {
  it('小寫、有空白的「邀請碼 a20990912-0001」也能綁定', async () => {
    const line: MockLineClient = installMockLine()
    const invite = await createInvite()

    const res = await postWebhook([textEvent('邀請碼 a20990912-0001')])
    expect(res.status).toBe(200)

    const user = await prisma.appUser.findUnique({ where: { lineUserId: 'Uwebhooktest1' } })
    expect(user).not.toBeNull()

    const member = await prisma.stallMember.findUnique({
      where: { userId_stallId: { userId: user!.id, stallId: invite.stall.id } },
    })
    expect(member).not.toBeNull()

    const code = await prisma.inviteCode.findFirst({ where: { code: invite.code } })
    expect(code?.status).toBe('REDEEMED')

    // 回覆含攤商名與攤位
    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('小麥麵包')
    expect(text).toContain('B03')
  })

  it('「邀請碼A20990912-0001」（無空白）也可以', async () => {
    installMockLine()
    await createInvite()

    await postWebhook([textEvent('邀請碼A20990912-0001')])

    const user = await prisma.appUser.findUnique({ where: { lineUserId: 'Uwebhooktest1' } })
    const members = await prisma.stallMember.count({ where: { userId: user!.id } })
    expect(members).toBe(1)
  })
})

describe('S5-4 無效邀請碼與其他文字', () => {
  it('格式正確但不存在的碼 → 回「邀請碼無效或已使用」', async () => {
    const line = installMockLine()

    await postWebhook([textEvent('邀請碼 Z20990101-9999')])

    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('邀請碼無效或已使用')
  })

  it('已兌換過的碼 → 同樣的訊息', async () => {
    const line = installMockLine()
    const invite = await createInvite()
    const other = await createUser({ role: 'user' })
    await prisma.inviteCode.updateMany({
      where: { code: invite.code },
      data: { status: 'REDEEMED', redeemedByUserId: other.id, redeemedAt: new Date() },
    })

    await postWebhook([textEvent(`邀請碼 ${invite.code}`)])

    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('邀請碼無效或已使用')
  })

  it('格式不符的文字 → 回固定說明', async () => {
    const line = installMockLine()

    await postWebhook([textEvent('邀請碼 XXXX')])

    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('請使用下方選單操作')
  })

  it('一般文字 → 回固定說明', async () => {
    const line = installMockLine()

    await postWebhook([textEvent('你好')])

    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('請使用下方選單操作')
  })
})

describe('postback 與 unfollow（04 §D）', () => {
  it('action=open_stall 回攤商專區連結', async () => {
    const line = installMockLine()

    await postWebhook([
      {
        type: 'postback',
        replyToken: 'r',
        source: { type: 'user', userId: 'Upostback1' },
        postback: { data: 'action=open_stall' },
      },
    ])

    const text = JSON.stringify(line.calls.reply[0].messages)
    expect(text).toContain('/stall')
  })

  it('unfollow 不刪帳號', async () => {
    installMockLine()
    const user = await prisma.appUser.create({
      data: { lineUserId: 'Uunfollow1', displayName: '要封鎖的人' },
    })

    await postWebhook([
      { type: 'unfollow', source: { type: 'user', userId: 'Uunfollow1' } },
    ])

    expect(await prisma.appUser.findUnique({ where: { id: user.id } })).not.toBeNull()
  })
})
