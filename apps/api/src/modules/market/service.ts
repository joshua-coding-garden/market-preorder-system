import type { MarketDayDetail, MarketDayListItem, Paged } from '@market/shared'
import type { MarketDay, Market, Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'
import { dateToIsoDate, isoDateToDate, timeToHhmm, todayInTaipei } from '../../lib/time.js'

type MarketDayWithMarket = MarketDay & { market: Market }

function toListItem(day: MarketDayWithMarket, stallCount: number): MarketDayListItem {
  return {
    id: day.id,
    market: {
      id: day.market.id,
      code: day.market.code,
      name: day.market.name,
      location: day.market.location,
    },
    eventDate: dateToIsoDate(day.eventDate),
    openTime: timeToHhmm(day.openTime),
    closeTime: timeToHhmm(day.closeTime),
    orderDeadline: day.orderDeadline.toISOString(),
    locationNote: day.locationNote,
    status: day.status,
    stallCount,
  }
}

/**
 * 下單可用性（04 §A）：顧客端與 POST /orders 共用同一函式。
 */
export function isOrderable(
  day: Pick<MarketDay, 'status' | 'orderDeadline'>,
  now: Date = new Date(),
): boolean {
  return day.status === 'PUBLISHED' && now.getTime() <= day.orderDeadline.getTime()
}

/**
 * GET /market-days（顧客用）：只回 PUBLISHED（S0-6）。
 * 無參數時回「今天（台北）起」最近 10 場。
 */
export async function listPublishedMarketDays(params: {
  from?: string
  limit?: number
  cursor?: string
}): Promise<Paged<MarketDayListItem>> {
  const limit = params.limit ?? 10
  const from = params.from ?? todayInTaipei()

  const where: Prisma.MarketDayWhereInput = {
    status: 'PUBLISHED',
    eventDate: { gte: isoDateToDate(from) },
  }

  const days = await prisma.marketDay.findMany({
    where,
    include: { market: true, _count: { select: { participations: true } } },
    orderBy: [{ eventDate: 'asc' }, { id: 'asc' }],
    take: limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  })

  const hasMore = days.length > limit
  const page = hasMore ? days.slice(0, limit) : days

  return {
    items: page.map((d) => toListItem(d, d._count.participations)),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  }
}

/**
 * GET /market-days/:id：DRAFT 只有 operator 看得到。
 */
export async function getMarketDayDetail(
  id: string,
  viewerIsOperator: boolean,
): Promise<MarketDayDetail> {
  const day = await prisma.marketDay.findUnique({
    where: { id },
    include: {
      market: true,
      participations: {
        include: {
          stall: {
            select: { id: true, name: true, description: true, logoUrl: true },
          },
        },
        orderBy: { boothNo: 'asc' },
      },
    },
  })

  if (!day) throw notFound('找不到場次')
  // 未發布的場次對非 operator 而言等同不存在
  if (day.status === 'DRAFT' && !viewerIsOperator) throw notFound('找不到場次')

  return {
    ...toListItem(day, day.participations.length),
    participations: day.participations.map((p) => ({
      id: p.id,
      boothNo: p.boothNo,
      stall: p.stall,
    })),
  }
}

/** GET /operator/markets：市集列表 */
export async function listMarkets() {
  const markets = await prisma.market.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { marketDays: true } } },
  })
  return markets.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    location: m.location,
    description: m.description,
    marketDayCount: m._count.marketDays,
    createdAt: m.createdAt.toISOString(),
  }))
}
