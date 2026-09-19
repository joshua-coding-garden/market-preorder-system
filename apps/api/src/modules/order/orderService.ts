import type { CreateOrderInput } from '@market/shared'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { AppError, forbidden, notFound } from '../../lib/errors.js'
import { events } from '../../lib/events.js'
import { isUniqueViolation } from '../../lib/inviteCode.js'
import {
  PICKUP_CODE_MAX_ATTEMPTS,
  buildPickupCode,
  nextPickupSerial,
} from '../../lib/pickupCode.js'
import { dateToIsoDate, timeToHhmm } from '../../lib/time.js'
import { notifyNewOrder } from '../line/notificationService.js'
import { isOrderable } from '../market/service.js'

/**
 * 下單（03 §7）。
 *
 * B-6：整個流程在單一交易內完成，並支援 idempotencyKey。
 * B-5：商品名稱、代碼、單價、內容物名稱與加價全部快照進訂單表。
 * D-04：item.line_total = (unit_price + Σ extra_price) × qty
 */

type SerializedOrder = Awaited<ReturnType<typeof serializeOrder>>

async function serializeOrder(preorderId: string, client = prisma) {
  const preorder = await client.preorder.findUnique({
    where: { id: preorderId },
    include: {
      marketDay: { include: { market: true } },
      subOrders: {
        include: {
          stall: { select: { id: true, name: true } },
          items: { include: { components: true } },
        },
        orderBy: { boothNo: 'asc' },
      },
    },
  })
  if (!preorder) throw notFound('找不到訂單')

  return {
    id: preorder.id,
    marketDay: {
      id: preorder.marketDay.id,
      eventDate: dateToIsoDate(preorder.marketDay.eventDate),
      openTime: timeToHhmm(preorder.marketDay.openTime),
      closeTime: timeToHhmm(preorder.marketDay.closeTime),
      location: preorder.marketDay.market.location,
      marketName: preorder.marketDay.market.name,
      locationNote: preorder.marketDay.locationNote,
      status: preorder.marketDay.status,
    },
    contactName: preorder.contactName,
    contactPhone: preorder.contactPhone,
    pickupAt: timeToHhmm(preorder.pickupAt),
    note: preorder.note,
    totalAmount: preorder.totalAmount,
    createdAt: preorder.createdAt.toISOString(),
    subOrders: preorder.subOrders.map((so) => ({
      id: so.id,
      stall: so.stall,
      boothNo: so.boothNo,
      pickupCode: so.pickupCode,
      status: so.status,
      subtotal: so.subtotal,
      confirmedAt: so.confirmedAt?.toISOString() ?? null,
      pickedUpAt: so.pickedUpAt?.toISOString() ?? null,
      items: so.items.map((i) => ({
        productCode: i.productCode,
        productName: i.productName,
        unitPrice: i.unitPrice,
        qty: i.qty,
        lineTotal: i.lineTotal,
        customNote: i.customNote,
        components: i.components.map((c) => ({
          name: c.name,
          extraPrice: c.extraPrice,
        })),
      })),
    })),
  }
}

/**
 * 在交易內產生取貨碼並建立子單。
 * 格式為 {攤位}-{流水號}；同時有兩筆訂單進同一攤時會撞號，撞到就 +1 重試。
 */
async function createSubOrderWithPickupCode(
  tx: Prisma.TransactionClient,
  data: {
    preorderId: string
    marketDayId: string
    stallId: string
    boothNo: string
    subtotal: number
  },
) {
  let serial = await nextPickupSerial(tx, data.marketDayId, data.stallId)

  for (let attempt = 0; attempt < PICKUP_CODE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await tx.subOrder.create({
        // ⚠️ 規格外（2026-09-20 指示）：下單先進「店家確認中」，
        // 店家按了確認才變成 PENDING（訂單成立）。
        data: {
          ...data,
          status: 'PENDING_CONFIRM',
          pickupCode: buildPickupCode(data.boothNo, serial),
        },
      })
    } catch (err) {
      if (isUniqueViolation(err, 'pickup_code')) {
        serial += 1
        continue
      }
      throw err
    }
  }
  throw new AppError('CONFLICT', '取貨碼配發失敗，請稍後再試')
}

export async function createOrder(
  userId: string,
  input: CreateOrderInput,
): Promise<{ order: SerializedOrder; created: boolean }> {
  // 1. idempotencyKey 已存在 → 直接回該 preorder（200）
  const existing = await prisma.preorder.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  })
  if (existing) {
    if (existing.userId !== userId) throw forbidden()
    return { order: await serializeOrder(existing.id), created: false }
  }

  const day = await prisma.marketDay.findUnique({ where: { id: input.marketDayId } })
  if (!day) throw notFound('找不到場次')

  // 2. 場次必須 PUBLISHED 且未過截止
  if (!isOrderable(day)) {
    throw new AppError('MARKET_DAY_CLOSED', '本場次預購已截止')
  }

  // 取貨時間必須落在營業時間內（D-06；前端滑桿已限制，後端一律再驗）
  const openTime = timeToHhmm(day.openTime)
  const closeTime = timeToHhmm(day.closeTime)
  if (input.pickupAt < openTime || input.pickupAt > closeTime) {
    throw new AppError('VALIDATION', `取貨時間需在 ${openTime}–${closeTime} 之間`)
  }

  const preorderId = await prisma.$transaction(async (tx) => {
    // 3. 讀購物車；空 → CART_EMPTY
    const cart = await tx.cart.findUnique({
      where: { userId_marketDayId: { userId, marketDayId: input.marketDayId } },
      include: {
        items: {
          include: {
            listing: { include: { product: true } },
            components: { include: { component: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!cart || cart.items.length === 0) {
      throw new AppError('CART_EMPTY', '購物車是空的')
    }

    // 4. 鎖 listing。依 id 排序取鎖，避免兩個交易互相等待造成死結。
    const listingIds = [...new Set(cart.items.map((i) => i.listingId))].sort()
    const locked = await tx.$queryRaw<
      { id: string; status: string; max_qty: number | null; price: number }[]
    >`SELECT id, status, max_qty, price FROM listing WHERE id = ANY(${listingIds}::uuid[]) ORDER BY id FOR UPDATE`

    const lockedById = new Map(locked.map((l) => [l.id, l]))

    const unavailable = listingIds.filter(
      (id) => !lockedById.has(id) || lockedById.get(id)!.status !== 'ON_SALE',
    )
    if (unavailable.length > 0) {
      throw new AppError('LISTING_UNAVAILABLE', '有商品已售完或下架，請先移除', {
        listingIds: unavailable,
      })
    }

    // 5. 預購上限：已售 + 本次 > max_qty → 409
    //    NO_SHOW 與 CANCELLED 會釋出上限（04 §B）
    //    ⚠️ 規格外（2026-09-20）：PENDING_CONFIRM 也要算進去，
    //    否則店家還沒確認的期間會被其他人重複下單，變成超賣。
    const wantedByListing = new Map<string, number>()
    for (const item of cart.items) {
      wantedByListing.set(
        item.listingId,
        (wantedByListing.get(item.listingId) ?? 0) + item.qty,
      )
    }

    const exceeded: string[] = []
    for (const [listingId, wanted] of wantedByListing) {
      const max = lockedById.get(listingId)!.max_qty
      if (max === null) continue
      const sold = await tx.orderItem.aggregate({
        where: {
          listingId,
          subOrder: { status: { in: ['PENDING_CONFIRM', 'PENDING', 'PICKED_UP'] } },
        },
        _sum: { qty: true },
      })
      if ((sold._sum.qty ?? 0) + wanted > max) exceeded.push(listingId)
    }
    if (exceeded.length > 0) {
      throw new AppError('LISTING_LIMIT_EXCEEDED', '超過可預購數量', {
        listingIds: exceeded,
      })
    }

    // 6. 依 stall 分組 → preorder → sub_order → order_item（全部快照）
    const participations = await tx.participation.findMany({
      where: { marketDayId: input.marketDayId },
      select: { stallId: true, boothNo: true },
    })
    const boothOf = new Map(participations.map((p) => [p.stallId, p.boothNo]))

    const byStall = new Map<string, typeof cart.items>()
    for (const item of cart.items) {
      const stallId = item.listing.stallId
      if (!byStall.has(stallId)) byStall.set(stallId, [])
      byStall.get(stallId)!.push(item)
    }

    const preorder = await tx.preorder.create({
      data: {
        marketDayId: input.marketDayId,
        userId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        pickupAt: new Date(`1970-01-01T${input.pickupAt}:00.000Z`),
        note: input.note ?? null,
        // 先填 0，三層金額算完後再更新
        totalAmount: 0,
        idempotencyKey: input.idempotencyKey,
      },
    })

    let totalAmount = 0
    const created: { subOrderId: string; stallId: string; pickupCode: string; itemCount: number; subtotal: number }[] = []

    for (const [stallId, items] of byStall) {
      let subtotal = 0
      const lines = items.map((item) => {
        // 價格以鎖住的 listing 為準，不是購物車快取
        const unitPrice = lockedById.get(item.listingId)!.price
        const extras = item.components.reduce((sum, c) => sum + c.component.extraPrice, 0)
        const lineTotal = (unitPrice + extras) * item.qty
        subtotal += lineTotal
        return { item, unitPrice, lineTotal }
      })

      const subOrder = await createSubOrderWithPickupCode(tx, {
        preorderId: preorder.id,
        marketDayId: input.marketDayId,
        stallId,
        // booth_no 快照：之後改攤位不影響已印給顧客的資訊
        boothNo: boothOf.get(stallId) ?? '',
        subtotal,
      })

      for (const { item, unitPrice, lineTotal } of lines) {
        await tx.orderItem.create({
          data: {
            subOrderId: subOrder.id,
            listingId: item.listingId,
            productCode: item.listing.product.code,
            productName: item.listing.product.name,
            unitPrice,
            qty: item.qty,
            lineTotal,
            customNote: item.customNote,
            components: {
              create: item.components.map((c) => ({
                componentId: c.componentId,
                name: c.component.name,
                extraPrice: c.component.extraPrice,
              })),
            },
          },
        })
      }

      totalAmount += subtotal
      created.push({
        subOrderId: subOrder.id,
        stallId,
        pickupCode: subOrder.pickupCode,
        itemCount: items.reduce((n, i) => n + i.qty, 0),
        subtotal,
      })
    }

    await tx.preorder.update({ where: { id: preorder.id }, data: { totalAmount } })

    // 7. 清空該購物車
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } })

    // 8. 更新使用者電話（下次結帳預填）
    await tx.appUser.update({
      where: { id: userId },
      data: { phone: input.contactPhone },
    })

    return { preorderId: preorder.id, created }
  })

  // 9. commit 後（交易外）：socket 推送 + LINE 通知
  for (const so of preorderId.created) {
    events.emit('order:new', {
      subOrderId: so.subOrderId,
      stallId: so.stallId,
      marketDayId: input.marketDayId,
      pickupCode: so.pickupCode,
      itemCount: so.itemCount,
      subtotal: so.subtotal,
    })
  }

  // LINE 通知失敗（含額度不足）不得影響訂單成立（S5-6）。
  // sender 已把每個收件人記成 SKIPPED_QUOTA／FAILED，這裡只吞掉例外。
  for (const so of preorderId.created) {
    try {
      await notifyNewOrder(so.subOrderId)
    } catch {
      // 已記錄在 notification 表，訂單照常回傳
    }
  }

  return { order: await serializeOrder(preorderId.preorderId), created: true }
}

/** GET /orders：我的總訂單列表（最新在前） */
export async function listMyOrders(userId: string) {
  const preorders = await prisma.preorder.findMany({
    where: { userId },
    include: {
      marketDay: { include: { market: true } },
      subOrders: { select: { id: true, status: true, subtotal: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return preorders.map((p) => ({
    id: p.id,
    marketDay: {
      id: p.marketDay.id,
      eventDate: dateToIsoDate(p.marketDay.eventDate),
      marketName: p.marketDay.market.name,
      location: p.marketDay.market.location,
    },
    pickupAt: timeToHhmm(p.pickupAt),
    totalAmount: p.totalAmount,
    stallCount: p.subOrders.length,
    statuses: p.subOrders.map((s) => s.status),
    createdAt: p.createdAt.toISOString(),
  }))
}

/** GET /orders/:id：非本人 → 403（呼叫端已做 assertPreorderOwner） */
export async function getMyOrder(preorderId: string) {
  return serializeOrder(preorderId)
}
