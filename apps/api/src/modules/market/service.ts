import type {
  CreateMarketDayInput,
  CreateMarketInput,
  MarketDayDetail,
  MarketDayListItem,
  Paged,
  UpdateMarketDayInput,
} from '@market/shared'
import type { Market, MarketDay, Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'
import { isUniqueViolation } from '../../lib/inviteCode.js'
import {
  dateToIsoDate,
  hhmmToTime,
  isoDateToDate,
  timeToHhmm,
  todayInTaipei,
} from '../../lib/time.js'

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
 * CLOSED 之後 listing／sub_order／participation 全部唯讀（04 §A）。
 * 所有會寫入該場次資料的端點都要先過這一關。
 */
export async function assertMarketDayWritable(
  marketDayId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<MarketDay> {
  const day = await client.marketDay.findUnique({ where: { id: marketDayId } })
  if (!day) throw notFound('找不到場次')
  if (day.status === 'CLOSED') {
    throw new AppError('CONFLICT', '場次已結案，無法再修改')
  }
  return day
}

// ---------------------------------------------------------------- 顧客端

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

  const days = await prisma.marketDay.findMany({
    where: { status: 'PUBLISHED', eventDate: { gte: isoDateToDate(from) } },
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

/** GET /market-days/:id：DRAFT 只有 operator 看得到。 */
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
          stall: { select: { id: true, name: true, description: true, logoUrl: true } },
        },
        orderBy: { boothNo: 'asc' },
      },
    },
  })

  if (!day) throw notFound('找不到場次')
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

// ---------------------------------------------------------------- 廠商：市集

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

export async function createMarket(input: CreateMarketInput) {
  try {
    const market = await prisma.market.create({ data: input })
    return {
      id: market.id,
      code: market.code,
      name: market.name,
      location: market.location,
      description: market.description,
      marketDayCount: 0,
      createdAt: market.createdAt.toISOString(),
    }
  } catch (err) {
    if (isUniqueViolation(err, 'code')) {
      throw new AppError('CONFLICT', `市集代號 ${input.code} 已存在`)
    }
    throw err
  }
}

// ---------------------------------------------------------------- 廠商：場次

export async function listOperatorMarketDays(params: {
  marketId?: string
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
}) {
  const days = await prisma.marketDay.findMany({
    where: {
      ...(params.marketId ? { marketId: params.marketId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    include: {
      market: true,
      _count: { select: { participations: true, preorders: true } },
    },
    orderBy: [{ eventDate: 'desc' }],
  })
  return days.map((d) => ({
    ...toListItem(d, d._count.participations),
    preorderCount: d._count.preorders,
  }))
}

export async function createMarketDay(input: CreateMarketDayInput) {
  const market = await prisma.market.findUnique({ where: { id: input.marketId } })
  if (!market) throw notFound('找不到市集')

  try {
    const day = await prisma.marketDay.create({
      data: {
        marketId: input.marketId,
        eventDate: isoDateToDate(input.eventDate),
        openTime: hhmmToTime(input.openTime),
        closeTime: hhmmToTime(input.closeTime),
        orderDeadline: new Date(input.orderDeadline),
        locationNote: input.locationNote ?? null,
      },
      include: { market: true },
    })
    return toListItem(day, 0)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('CONFLICT', '同一個市集在這一天已經有場次了')
    }
    throw err
  }
}

export async function updateMarketDay(id: string, input: UpdateMarketDayInput) {
  const existing = await assertMarketDayWritable(id)

  const data: Prisma.MarketDayUpdateInput = {}
  if (input.eventDate !== undefined) data.eventDate = isoDateToDate(input.eventDate)
  if (input.openTime !== undefined) data.openTime = hhmmToTime(input.openTime)
  if (input.closeTime !== undefined) data.closeTime = hhmmToTime(input.closeTime)
  if (input.orderDeadline !== undefined) data.orderDeadline = new Date(input.orderDeadline)
  if (input.locationNote !== undefined) data.locationNote = input.locationNote

  // 只給了其中一個時間時，要和資料庫現值比對
  const openTime = input.openTime ?? timeToHhmm(existing.openTime)
  const closeTime = input.closeTime ?? timeToHhmm(existing.closeTime)
  if (closeTime <= openTime) {
    throw new AppError('VALIDATION', '結束時間必須晚於開始時間')
  }

  const day = await prisma.marketDay.update({
    where: { id },
    data,
    include: { market: true, _count: { select: { participations: true } } },
  })
  return toListItem(day, day._count.participations)
}

/** DRAFT → PUBLISHED（至少 1 個 participation） */
export async function publishMarketDay(id: string) {
  const day = await prisma.marketDay.findUnique({
    where: { id },
    include: { market: true, _count: { select: { participations: true } } },
  })
  if (!day) throw notFound('找不到場次')
  if (day.status !== 'DRAFT') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有未發布的場次可以發布')
  }
  if (day._count.participations === 0) {
    throw new AppError('VALIDATION', '場次至少要有一個攤商才能發布')
  }

  const updated = await prisma.marketDay.update({
    where: { id },
    data: { status: 'PUBLISHED' },
    include: { market: true, _count: { select: { participations: true } } },
  })
  return toListItem(updated, updated._count.participations)
}

/** PUBLISHED → DRAFT（該場次不能有任何 preorder） */
export async function unpublishMarketDay(id: string) {
  const day = await prisma.marketDay.findUnique({
    where: { id },
    include: { market: true, _count: { select: { participations: true, preorders: true } } },
  })
  if (!day) throw notFound('找不到場次')
  if (day.status !== 'PUBLISHED') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有已發布的場次可以取消發布')
  }
  if (day._count.preorders > 0) {
    throw new AppError('CONFLICT', '這個場次已經有訂單，不能取消發布')
  }

  const updated = await prisma.marketDay.update({
    where: { id },
    data: { status: 'DRAFT' },
    include: { market: true, _count: { select: { participations: true } } },
  })
  return toListItem(updated, updated._count.participations)
}

/**
 * PUBLISHED → CLOSED（04 §A）
 * 副作用：所有 PENDING 子單 → NO_SHOW；closed_at = now()；該場 ACTIVE 邀請碼 → EXPIRED
 */
export async function closeMarketDay(id: string): Promise<{ noShowCount: number }> {
  const day = await prisma.marketDay.findUnique({ where: { id } })
  if (!day) throw notFound('找不到場次')
  if (day.status !== 'PUBLISHED') {
    throw new AppError('INVALID_STATE_TRANSITION', '只有已發布的場次可以結案')
  }

  return prisma.$transaction(async (tx) => {
    const noShow = await tx.subOrder.updateMany({
      where: { marketDayId: id, status: 'PENDING' },
      data: { status: 'NO_SHOW' },
    })
    await tx.inviteCode.updateMany({
      where: { participation: { marketDayId: id }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    })
    await tx.marketDay.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
    return { noShowCount: noShow.count }
  })
}

