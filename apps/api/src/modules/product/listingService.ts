import type { ListingInput } from '@market/shared'
import { prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'
import { assertMarketDayWritable } from '../market/service.js'

/**
 * 本場上架（03 §5）與顧客可見商品（schema.sql Q1）。
 */

/** GET /stalls/:stallId/market-days/:dayId/listings */
export async function listStallListings(stallId: string, marketDayId: string) {
  const listings = await prisma.listing.findMany({
    where: { stallId, marketDayId },
    include: { product: true },
  })
  return listings.map((l) => ({
    id: l.id,
    productId: l.productId,
    productCode: l.product.code,
    productName: l.product.name,
    thumbUrl: l.product.thumbUrl,
    basePrice: l.product.basePrice,
    price: l.price,
    maxQty: l.maxQty,
    status: l.status,
  }))
}

/** PUT ...：整組 upsert；場次 CLOSED → 409 */
export async function replaceListings(
  stallId: string,
  marketDayId: string,
  input: ListingInput[],
) {
  await assertMarketDayWritable(marketDayId)

  // B-7 / B-1：productId 必須屬於這個攤商，不能靠前端保證
  const owned = await prisma.product.findMany({
    where: { stallId, id: { in: input.map((l) => l.productId) } },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((p) => p.id))
  const rejected = input.filter((l) => !ownedIds.has(l.productId))
  if (rejected.length > 0) throw notFound('有商品不屬於這個攤商')

  await prisma.$transaction(async (tx) => {
    for (const l of input) {
      await tx.listing.upsert({
        where: { marketDayId_productId: { marketDayId, productId: l.productId } },
        create: {
          marketDayId,
          productId: l.productId,
          // 反正規化欄位由伺服器帶入，不接受前端傳入（02 §G）
          stallId,
          price: l.price,
          maxQty: l.maxQty ?? null,
          status: l.status,
        },
        update: { price: l.price, maxQty: l.maxQty ?? null, status: l.status },
      })
    }

    // 這次沒列出的商品視為下架
    const keep = input.map((l) => l.productId)
    await tx.listing.updateMany({
      where: { marketDayId, stallId, productId: { notIn: keep.length ? keep : ['-'] } },
      data: { status: 'OFF_SHELF' },
    })
  })

  return listStallListings(stallId, marketDayId)
}

/** POST .../copy-from：已存在者跳過（S2-7） */
export async function copyListingsFrom(
  stallId: string,
  marketDayId: string,
  sourceDayId: string,
): Promise<{ copied: number; skipped: number }> {
  await assertMarketDayWritable(marketDayId)

  const source = await prisma.listing.findMany({ where: { stallId, marketDayId: sourceDayId } })
  const existing = await prisma.listing.findMany({
    where: { stallId, marketDayId },
    select: { productId: true },
  })
  const existingIds = new Set(existing.map((l) => l.productId))

  let copied = 0
  let skipped = 0
  for (const l of source) {
    if (existingIds.has(l.productId)) {
      skipped += 1
      continue
    }
    await prisma.listing.create({
      data: {
        marketDayId,
        productId: l.productId,
        stallId,
        price: l.price,
        maxQty: l.maxQty,
        status: 'ON_SALE',
      },
    })
    copied += 1
  }
  return { copied, skipped }
}

/**
 * 顧客可見的本場商品（schema.sql Q1）：
 *   場次必須 PUBLISHED、listing 非 OFF_SHELF、product.is_active。
 */
export async function listPublicListings(
  marketDayId: string,
  filters: { stallId?: string; q?: string } = {},
) {
  const day = await prisma.marketDay.findUnique({ where: { id: marketDayId } })
  if (!day) throw notFound('找不到場次')
  if (day.status !== 'PUBLISHED') throw notFound('找不到場次')

  const listings = await prisma.listing.findMany({
    where: {
      marketDayId,
      status: { not: 'OFF_SHELF' },
      product: {
        isActive: true,
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { code: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      ...(filters.stallId ? { stallId: filters.stallId } : {}),
    },
    include: {
      product: {
        include: { components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
      },
      stall: { select: { id: true, name: true } },
    },
    orderBy: [{ stallId: 'asc' }, { product: { sortOrder: 'asc' } }],
  })

  const participations = await prisma.participation.findMany({
    where: { marketDayId },
    select: { stallId: true, boothNo: true },
  })
  const boothOf = new Map(participations.map((p) => [p.stallId, p.boothNo]))

  return listings.map((l) => ({
    listingId: l.id,
    productId: l.productId,
    code: l.product.code,
    name: l.product.name,
    description: l.product.description,
    imageUrl: l.product.imageUrl,
    thumbUrl: l.product.thumbUrl,
    price: l.price,
    maxQty: l.maxQty,
    status: l.status,
    stall: { ...l.stall, boothNo: boothOf.get(l.stallId) ?? '' },
    components: l.product.components.map((c) => ({
      id: c.id,
      name: c.name,
      extraPrice: c.extraPrice,
      allowCustomNote: c.allowCustomNote,
    })),
  }))
}
