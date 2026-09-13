import type { AddCartItemInput } from '@market/shared'
import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'

/**
 * 購物車（03 §6、D-05）
 *   - 以 (user_id, market_day_id) 為一個購物車，由伺服器自動建立
 *   - cart_item 不存價格，結帳時重新查 listing（避免過期價格）
 *   - 同 listing + 相同內容物組合 → 數量累加；不同組合 → 新增一列
 *   - 已選內容物不可編輯，要改就刪掉重加
 */

/** 把內容物組合正規化成可比較的字串 */
function componentKey(components: { componentId: string }[]): string {
  return components.map((c) => c.componentId).sort().join('|')
}

/** 同 listing + 相同內容物組合 + 相同備註才算同一列 */
function lineKey(components: { componentId: string }[], note: string | null): string {
  return `${componentKey(components)}#${(note ?? '').trim()}`
}

async function getOrCreateCart(userId: string, marketDayId: string) {
  const day = await prisma.marketDay.findUnique({ where: { id: marketDayId } })
  if (!day) throw notFound('找不到場次')

  return prisma.cart.upsert({
    where: { userId_marketDayId: { userId, marketDayId } },
    create: { userId, marketDayId },
    update: {},
  })
}

/** GET /cart：按攤商分組，附最新 listing 價格與狀態 */
export async function getCart(userId: string, marketDayId: string) {
  const cart = await getOrCreateCart(userId, marketDayId)

  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    include: {
      listing: {
        include: {
          product: true,
          stall: { select: { id: true, name: true } },
        },
      },
      components: { include: { component: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const participations = await prisma.participation.findMany({
    where: { marketDayId },
    select: { stallId: true, boothNo: true },
  })
  const boothOf = new Map(participations.map((p) => [p.stallId, p.boothNo]))

  const groups = new Map<
    string,
    {
      stall: { id: string; name: string; boothNo: string }
      items: ReturnType<typeof serializeItem>[]
      subtotal: number
    }
  >()

  function serializeItem(item: (typeof items)[number]) {
    const extras = item.components.reduce((sum, c) => sum + c.component.extraPrice, 0)
    const unavailable = item.listing.status !== 'ON_SALE'
    return {
      id: item.id,
      listingId: item.listingId,
      productCode: item.listing.product.code,
      productName: item.listing.product.name,
      thumbUrl: item.listing.product.thumbUrl,
      unitPrice: item.listing.price,
      qty: item.qty,
      lineTotal: (item.listing.price + extras) * item.qty,
      customNote: item.customNote,
      status: item.listing.status,
      unavailable,
      maxQty: item.listing.maxQty,
      components: item.components.map((c) => ({
        componentId: c.componentId,
        name: c.component.name,
        extraPrice: c.component.extraPrice,
      })),
    }
  }

  for (const item of items) {
    const stallId = item.listing.stallId
    if (!groups.has(stallId)) {
      groups.set(stallId, {
        stall: { ...item.listing.stall, boothNo: boothOf.get(stallId) ?? '' },
        items: [],
        subtotal: 0,
      })
    }
    const group = groups.get(stallId)!
    const serialized = serializeItem(item)
    group.items.push(serialized)
    if (!serialized.unavailable) group.subtotal += serialized.lineTotal
  }

  const stalls = [...groups.values()]
  return {
    marketDayId,
    stalls,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    total: stalls.reduce((sum, g) => sum + g.subtotal, 0),
    hasUnavailable: items.some((i) => i.listing.status !== 'ON_SALE'),
  }
}

/** POST /cart/items */
export async function addCartItem(userId: string, input: AddCartItemInput) {
  const listing = await prisma.listing.findUnique({
    where: { id: input.listingId },
    include: { product: { include: { components: true } } },
  })
  if (!listing) throw notFound('找不到商品')
  if (listing.marketDayId !== input.marketDayId) {
    throw new AppError('VALIDATION', '商品不屬於這個場次')
  }
  if (listing.status !== 'ON_SALE') {
    throw new AppError('LISTING_UNAVAILABLE', '這個商品已售完或已下架', {
      listingIds: [listing.id],
    })
  }

  // 內容物必須屬於這個商品且仍啟用（B-1：不信任前端傳來的 id）
  const validIds = new Set(
    listing.product.components.filter((c) => c.isActive).map((c) => c.id),
  )
  for (const c of input.components) {
    if (!validIds.has(c.componentId)) {
      throw new AppError('VALIDATION', '選擇的內容物不存在')
    }
  }
  const note = input.customNote?.trim() || null

  const cart = await getOrCreateCart(userId, input.marketDayId)
  const wantedKey = lineKey(input.components, note)

  const existing = await prisma.cartItem.findMany({
    where: { cartId: cart.id, listingId: input.listingId },
    include: { components: true },
  })
  const match = existing.find(
    (item) => lineKey(item.components, item.customNote) === wantedKey,
  )

  if (match) {
    // 同 listing + 相同內容物組合 → 數量累加（S3-2）
    const updated = await prisma.cartItem.update({
      where: { id: match.id },
      data: { qty: Math.min(99, match.qty + input.qty) },
    })
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } })
    return { id: updated.id, qty: updated.qty, merged: true }
  }

  const created = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      listingId: input.listingId,
      qty: input.qty,
      customNote: note,
      components: {
        create: input.components.map((c) => ({ componentId: c.componentId })),
      },
    },
  })
  await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } })
  return { id: created.id, qty: created.qty, merged: false }
}

/** 取自己的 cart_item；別人的一律視為不存在 */
async function getOwnedCartItem(userId: string, itemId: string) {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: { userId } },
    include: { cart: true },
  })
  if (!item) throw notFound('找不到購物車項目')
  return item
}

/** PATCH /cart/items/:id：只能改數量；qty=0 等同刪除（S3-4） */
export async function updateCartItemQty(userId: string, itemId: string, qty: number) {
  const item = await getOwnedCartItem(userId, itemId)

  if (qty === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } })
    return { deleted: true }
  }

  const updated = await prisma.cartItem.update({ where: { id: itemId }, data: { qty } })
  await prisma.cart.update({
    where: { id: item.cartId },
    data: { updatedAt: new Date() },
  })
  return { deleted: false, qty: updated.qty }
}

export async function deleteCartItem(userId: string, itemId: string): Promise<void> {
  await getOwnedCartItem(userId, itemId)
  await prisma.cartItem.delete({ where: { id: itemId } })
}

export async function clearCart(userId: string, marketDayId: string): Promise<void> {
  const cart = await prisma.cart.findUnique({
    where: { userId_marketDayId: { userId, marketDayId } },
  })
  if (!cart) return
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
}
