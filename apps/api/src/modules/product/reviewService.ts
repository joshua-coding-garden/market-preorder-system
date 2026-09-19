import type { OperatorListingQuery, OperatorUpdateListingInput } from '@market/shared'
import { prisma } from '../../lib/db.js'
import { notFound } from '../../lib/errors.js'

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：管理員端的上架審核與強制上／下架。
 *
 * 這裡的端點全部只掛 assertOperator，攤商叫不動（04 §H）。
 */

const LISTING_INCLUDE = {
  product: { select: { id: true, code: true, name: true, thumbUrl: true, description: true } },
  stall: { select: { id: true, name: true } },
  marketDay: { select: { id: true, eventDate: true, status: true } },
} as const

type ListingRow = Awaited<
  ReturnType<typeof prisma.listing.findFirstOrThrow<{ include: typeof LISTING_INCLUDE }>>
>

function serialize(l: ListingRow) {
  return {
    id: l.id,
    price: l.price,
    maxQty: l.maxQty,
    status: l.status,
    approval: l.approval,
    rejectReason: l.rejectReason,
    reviewedAt: l.reviewedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    product: l.product,
    stall: l.stall,
    marketDay: {
      id: l.marketDay.id,
      eventDate: l.marketDay.eventDate.toISOString().slice(0, 10),
      status: l.marketDay.status,
    },
  }
}

/** GET /operator/listings */
export async function listListingsForReview(filters: OperatorListingQuery) {
  const rows = await prisma.listing.findMany({
    where: {
      ...(filters.approval ? { approval: filters.approval } : {}),
      ...(filters.marketDayId ? { marketDayId: filters.marketDayId } : {}),
      ...(filters.stallId ? { stallId: filters.stallId } : {}),
    },
    include: LISTING_INCLUDE,
    orderBy: [{ createdAt: 'desc' }],
    take: 500,
  })
  return rows.map(serialize)
}

async function getOr404(listingId: string) {
  const row = await prisma.listing.findUnique({ where: { id: listingId }, include: LISTING_INCLUDE })
  if (!row) throw notFound('找不到這筆上架')
  return row
}

/** POST /operator/listings/:id/approve */
export async function approveListing(listingId: string, reviewerId: string) {
  await getOr404(listingId)
  const row = await prisma.listing.update({
    where: { id: listingId },
    data: {
      approval: 'APPROVED',
      rejectReason: null,
      reviewedAt: new Date(),
      reviewedByUserId: reviewerId,
    },
    include: LISTING_INCLUDE,
  })
  return serialize(row)
}

/** POST /operator/listings/:id/reject */
export async function rejectListing(listingId: string, reviewerId: string, reason: string) {
  await getOr404(listingId)
  const row = await prisma.listing.update({
    where: { id: listingId },
    data: {
      approval: 'REJECTED',
      rejectReason: reason,
      reviewedAt: new Date(),
      reviewedByUserId: reviewerId,
    },
    include: LISTING_INCLUDE,
  })
  return serialize(row)
}

/**
 * PATCH /operator/listings/:id：強制上／下架，也可以直接改價與上限。
 *
 * 強制上架＝管理員自己拍板，所以一併蓋成 APPROVED；
 * 否則開著審核時按了「上架」卻還是不出現在顧客端，很難解釋。
 */
export async function operatorUpdateListing(
  listingId: string,
  reviewerId: string,
  input: OperatorUpdateListingInput,
) {
  await getOr404(listingId)
  const approvedByForce =
    input.status && input.status !== 'OFF_SHELF'
      ? {
          approval: 'APPROVED' as const,
          rejectReason: null,
          reviewedAt: new Date(),
          reviewedByUserId: reviewerId,
        }
      : {}

  const row = await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.price === undefined ? {} : { price: input.price }),
      ...(input.maxQty === undefined ? {} : { maxQty: input.maxQty }),
      ...approvedByForce,
    },
    include: LISTING_INCLUDE,
  })
  return serialize(row)
}
