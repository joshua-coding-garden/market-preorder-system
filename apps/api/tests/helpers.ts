import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { config } from '../src/config.js'
import { prisma } from '../src/lib/db.js'
import { signSession } from '../src/lib/jwt.js'
import { hhmmToTime, isoDateToDate, taipeiToUtc, todayInTaipei, addDaysIso } from '../src/lib/time.js'

// 測試常用的時間工具，統一從 helpers 匯出，避免每個測試檔各自 import
export { isoDateToDate, todayInTaipei, addDaysIso, hhmmToTime, taipeiToUtc }

/** 依相依順序清空所有資料表（保留 _prisma_migrations） */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      order_item_component, order_item, sub_order, preorder,
      cart_item_component, cart_item, cart,
      listing, product_component, product,
      invite_code, participation, stall_member, stall,
      local_credential,
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

/** 直接建立 stall_member（跳過邀請碼流程，測試用） */
export async function joinStall(userId: string, stallId: string) {
  return prisma.stallMember.upsert({
    where: { userId_stallId: { userId, stallId } },
    create: { userId, stallId },
    update: {},
  })
}

/** 建立 participation（攤商參加某場次） */
export async function createParticipation(
  marketDayId: string,
  stallId: string,
  boothNo = 'B01',
) {
  return prisma.participation.create({ data: { marketDayId, stallId, boothNo } })
}

/** 建立商品（可含內容物） */
export async function createProduct(opts: {
  stallId: string
  code: string
  name: string
  basePrice: number
  components?: { name: string; extraPrice: number; allowCustomNote?: boolean }[]
}) {
  return prisma.product.create({
    data: {
      stallId: opts.stallId,
      code: opts.code,
      name: opts.name,
      basePrice: opts.basePrice,
      components: opts.components?.length
        ? {
            create: opts.components.map((c, i) => ({
              name: c.name,
              extraPrice: c.extraPrice,
              allowCustomNote: c.allowCustomNote ?? true,
              sortOrder: i + 1,
            })),
          }
        : undefined,
    },
    include: { components: { orderBy: { sortOrder: 'asc' } } },
  })
}

/** 上架商品到某場次 */
export async function createListing(opts: {
  marketDayId: string
  productId: string
  stallId: string
  price: number
  maxQty?: number | null
  status?: 'ON_SALE' | 'SOLD_OUT' | 'OFF_SHELF'
}) {
  return prisma.listing.create({
    data: {
      marketDayId: opts.marketDayId,
      productId: opts.productId,
      stallId: opts.stallId,
      price: opts.price,
      maxQty: opts.maxQty ?? null,
      status: opts.status ?? 'ON_SALE',
    },
  })
}
