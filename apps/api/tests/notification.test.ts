/**
 * 07-驗收條件.md §S5：S5-5 ~ S5-7（系統通知與額度守門，04 §E）
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '../src/lib/db.js'
import { pickupReminder } from '../src/modules/line/notificationService.js'
import { localMonthlyUsage } from '../src/lib/line/sender.js'
import {
  closeTestApp,
  createUser,
  isoDateToDate,
  joinStall,
  resetDb,
  todayInTaipei,
} from './helpers.js'
import { placeOrder, setupTwoStalls } from './fixtures.js'
import { installMockLine, uninstallMockLine } from './lineMock.js'

beforeEach(async () => {
  await resetDb()
})

afterEach(() => {
  uninstallMockLine()
})

afterAll(async () => {
  await closeTestApp()
})

describe('S5-5 新訂單通知', () => {
  it('攤商有 2 位成員 → push 2 次、2 筆 NEW_ORDER SENT', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    // 攤商 A 再加一位成員，共 2 位
    const secondMember = await createUser({ role: 'user' })
    await joinStall(secondMember.id, ctx.stallA.id)

    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 2 },
    ])

    // 2 人 → multicast 一批 2 人
    expect(line.totalRecipients()).toBe(2)

    const notifications = await prisma.notification.findMany({
      where: { kind: 'NEW_ORDER', refId: order.subOrders[0].id },
    })
    expect(notifications).toHaveLength(2)
    expect(notifications.every((n) => n.status === 'SENT')).toBe(true)
    expect(notifications.every((n) => n.sentAt !== null)).toBe(true)

    // 訊息內容含攤商名、項數、金額與取貨碼
    const text = JSON.stringify(line.calls)
    expect(text).toContain('小麥麵包')
    expect(text).toContain(order.subOrders[0].pickupCode)
    expect(text).toContain('240')
  })

  it('單一成員時用 push', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()

    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    expect(line.calls.push).toHaveLength(1)
    expect(line.calls.multicast).toHaveLength(0)
  })

  it('跨兩攤的訂單，各攤只收到自己的那一張子單', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()

    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
      { listingId: ctx.listings.drip.id, qty: 1 },
    ])

    expect(line.calls.push).toHaveLength(2)
    const a = line.calls.push.find((c) => JSON.stringify(c.messages).includes('小麥麵包'))
    expect(JSON.stringify(a?.messages)).not.toContain('掛耳包')
  })

  it('沒有成員的攤商不會產生通知', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    await prisma.stallMember.deleteMany({ where: { stallId: ctx.stallA.id } })

    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    expect(line.totalRecipients()).toBe(0)
    expect(await prisma.notification.count({ where: { kind: 'NEW_ORDER' } })).toBe(0)
  })

  it('送出失敗時記 FAILED，訂單仍成立', async () => {
    installMockLine({ failSend: true })
    const ctx = await setupTwoStalls()

    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    expect(order.id).toBeTruthy()
    const notifications = await prisma.notification.findMany({ where: { kind: 'NEW_ORDER' } })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].status).toBe('FAILED')
  })
})

describe('S5-6 額度守門（B-11）', () => {
  it('used=199 limit=200、2 位成員 → 0 次 push、2 筆 SKIPPED_QUOTA，訂單仍成立', async () => {
    const line = installMockLine({ consumption: 199, quota: 200 })
    const ctx = await setupTwoStalls()
    const secondMember = await createUser({ role: 'user' })
    await joinStall(secondMember.id, ctx.stallA.id)

    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    // 訂單必須成立
    expect(order.id).toBeTruthy()
    const preorder = await prisma.preorder.findUnique({ where: { id: order.id } })
    expect(preorder).not.toBeNull()
    expect(await prisma.subOrder.count({ where: { preorderId: order.id } })).toBe(1)

    // 完全沒有呼叫任何送出 API
    expect(line.totalRecipients()).toBe(0)
    expect(line.calls.push).toHaveLength(0)
    expect(line.calls.multicast).toHaveLength(0)
    expect(line.calls.broadcast).toHaveLength(0)

    const notifications = await prisma.notification.findMany({ where: { kind: 'NEW_ORDER' } })
    expect(notifications).toHaveLength(2)
    expect(notifications.every((n) => n.status === 'SKIPPED_QUOTA')).toBe(true)
    expect(notifications[0].error).toContain('額度不足')
  })

  it('剛好用完額度時可以送出（used + estimate === limit）', async () => {
    const line = installMockLine({ consumption: 199, quota: 200 })
    const ctx = await setupTwoStalls()

    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    expect(line.totalRecipients()).toBe(1)
  })

  it('LINE quota API 取不到時用本地統計與 env 上限', async () => {
    installMockLine({ consumption: null, quota: null })
    const ctx = await setupTwoStalls()

    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    // 這筆已送出，本地統計應該要看得到
    expect(await localMonthlyUsage()).toBe(1)
  })
})

describe('S5-7 當日取貨提醒', () => {
  /** 把場次改成今天（台北），讓 pickupReminder 抓得到 */
  async function moveDayToToday(dayId: string) {
    await prisma.marketDay.update({
      where: { id: dayId },
      data: { eventDate: isoDateToDate(todayInTaipei()) },
    })
  }

  it('3 位顧客有 PENDING、1 位全 PICKED_UP → 3 筆 SENT；再跑一次不重複', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    await moveDayToToday(ctx.day.id)

    const buyers = [
      ctx.customer,
      await createUser({ role: 'user' }),
      await createUser({ role: 'user' }),
    ]
    for (const b of buyers) {
      await placeOrder(ctx.app, b.cookie, ctx.day.id, [
        { listingId: ctx.listings.toast.id, qty: 1 },
      ])
    }

    // 第四位：下單後立刻核銷，全部 PICKED_UP
    const pickedUpBuyer = await createUser({ role: 'user' })
    const pickedOrder = await placeOrder(ctx.app, pickedUpBuyer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    await prisma.subOrder.updateMany({
      where: { preorderId: pickedOrder.id },
      data: { status: 'PICKED_UP' },
    })

    line.reset()
    const first = await pickupReminder()
    expect(first.sent).toBe(3)

    const reminders = await prisma.notification.findMany({
      where: { kind: 'PICKUP_REMINDER' },
    })
    expect(reminders).toHaveLength(3)
    expect(reminders.every((n) => n.status === 'SENT')).toBe(true)
    // 已全部取貨的那位不會收到
    expect(reminders.some((n) => n.userId === pickedUpBuyer.id)).toBe(false)

    // 冪等：再跑一次不會重複送
    line.reset()
    const second = await pickupReminder()
    expect(second.sent).toBe(0)
    expect(second.skipped).toBe(3)
    expect(line.totalRecipients()).toBe(0)
    expect(await prisma.notification.count({ where: { kind: 'PICKUP_REMINDER' } })).toBe(3)
  })

  it('不是今天的場次不會送', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    line.reset()
    const result = await pickupReminder()
    expect(result.sent).toBe(0)
    expect(line.totalRecipients()).toBe(0)
  })

  it('提醒訊息含攤商名、取貨碼與取貨時間', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    await moveDayToToday(ctx.day.id)
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    line.reset()
    await pickupReminder()

    const text = JSON.stringify(line.calls.push)
    expect(text).toContain('小麥麵包')
    expect(text).toContain(order.subOrders[0].pickupCode)
    expect(text).toContain('10:30')
  })

  it('額度不足時記 SKIPPED_QUOTA 且不呼叫 push', async () => {
    const line = installMockLine({ consumption: 200, quota: 200 })
    const ctx = await setupTwoStalls()
    await moveDayToToday(ctx.day.id)
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    line.reset()
    const result = await pickupReminder()

    expect(result.sent).toBe(0)
    expect(line.totalRecipients()).toBe(0)
    const skipped = await prisma.notification.findMany({
      where: { kind: 'PICKUP_REMINDER', status: 'SKIPPED_QUOTA' },
    })
    expect(skipped).toHaveLength(1)
  })
})

describe('Google 暫時帳號（規格外的登入通道）', () => {
  it('收不到 LINE 推播，記 FAILED 但不影響訂單', async () => {
    const line = installMockLine()
    const ctx = await setupTwoStalls()
    await prisma.appUser.update({
      where: { id: ctx.ownerA.id },
      data: { lineUserId: `google:${ctx.ownerA.id}` },
    })

    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])

    expect(order.id).toBeTruthy()
    expect(line.totalRecipients()).toBe(0)
    const n = await prisma.notification.findFirst({ where: { kind: 'NEW_ORDER' } })
    expect(n?.status).toBe('FAILED')
    expect(n?.error).toContain('不是 LINE 使用者')
  })
})
