import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { config } from '../src/config.js'
import { prisma } from '../src/lib/db.js'
import { signSession } from '../src/lib/jwt.js'
import { hhmmToTime, isoDateToDate, taipeiToUtc, todayInTaipei, addDaysIso } from '../src/lib/time.js'

/** 依相依順序清空所有資料表（保留 _prisma_migrations） */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      order_item_component, order_item, sub_order, preorder,
      cart_item_component, cart_item, cart,
      listing, product_component, product,
      invite_code, participation, stall_member, stall,
      market_day, market,
      notification, broadcast, app_user
    RESTART IDENTITY CASCADE
  `)
}

let app: FastifyInstance | null = null

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp()
    await app.ready()
  }
  return app
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close()
    app = null
  }
  await prisma.$disconnect()
}

/** 產生一個 session cookie header 值（等同登入該使用者） */
export async function sessionCookie(userId: string): Promise<string> {
  const token = await signSession(userId)
  return `${config.sessionCookieName}=${token}`
}

let userSeq = 0

export async function createUser(
  opts: { role?: 'user' | 'operator'; displayName?: string } = {},
): Promise<{ id: string; lineUserId: string; cookie: string }> {
  userSeq += 1
  const lineUserId = `Utest${Date.now()}${userSeq}`
  const user = await prisma.appUser.create({
    data: {
      lineUserId,
      displayName: opts.displayName ?? `測試使用者${userSeq}`,
      role: opts.role ?? 'user',
    },
    select: { id: true },
  })
  return { id: user.id, lineUserId, cookie: await sessionCookie(user.id) }
}

export async function createMarket(code = 'A', name = '測試市集') {
  return prisma.market.create({
    data: { code, name, location: '測試地點' },
  })
}

/** 建立場次；預設為明天、09:00–15:00、今晚 22:00 截止 */
export async function createMarketDay(opts: {
  marketId: string
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  eventDate?: string
  openTime?: string
  closeTime?: string
  orderDeadline?: Date
}) {
  const eventDate = opts.eventDate ?? addDaysIso(todayInTaipei(), 1)
  return prisma.marketDay.create({
    data: {
      marketId: opts.marketId,
      eventDate: isoDateToDate(eventDate),
      openTime: hhmmToTime(opts.openTime ?? '09:00'),
      closeTime: hhmmToTime(opts.closeTime ?? '15:00'),
      orderDeadline: opts.orderDeadline ?? taipeiToUtc(todayInTaipei(), '22:00:00'),
      status: opts.status ?? 'PUBLISHED',
    },
  })
}

export async function createStall(name = '測試攤商') {
  return prisma.stall.create({ data: { name } })
}
