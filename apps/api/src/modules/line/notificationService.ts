import { prisma } from '../../lib/db.js'
import { AppError } from '../../lib/errors.js'
import { newOrderMessage, pickupReminderMessage } from '../../lib/line/messages.js'
import { send, type SendTarget } from '../../lib/line/sender.js'
import { dateToIsoDate, timeToHhmm, todayInTaipei } from '../../lib/time.js'

/**
 * 系統通知（04 §E）。
 * 所有訊息都經過 lib/line/sender.ts 的額度守門（B-11）。
 */

/**
 * NEW_ORDER：子單建立後推給該攤所有 stall_member。
 *
 * **額度不足時訂單仍必須成立**（S5-6），因此呼叫端要把這支包在 try/catch 裡，
 * 這裡也不會把例外往上丟到交易中 —— 交易早已 commit。
 */
export async function notifyNewOrder(subOrderId: string): Promise<void> {
  const subOrder = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    include: {
      stall: {
        select: {
          id: true,
          name: true,
          members: { include: { user: { select: { id: true, lineUserId: true } } } },
        },
      },
      marketDay: true,
      items: true,
    },
  })
  if (!subOrder) return

  const targets: SendTarget[] = subOrder.stall.members.map((m) => ({
    userId: m.user.id,
    lineUserId: m.user.lineUserId,
  }))
  if (targets.length === 0) return

  const messages = newOrderMessage({
    stallName: subOrder.stall.name,
    eventDate: dateToIsoDate(subOrder.marketDay.eventDate),
    itemCount: subOrder.items.reduce((n, i) => n + i.qty, 0),
    subtotal: subOrder.subtotal,
    pickupCode: subOrder.pickupCode,
    stallId: subOrder.stallId,
    marketDayId: subOrder.marketDayId,
  })

  await send({ kind: 'NEW_ORDER', refId: subOrderId, targets, messages })
}

/**
 * PICKUP_REMINDER（04 §G）：場次當天提醒有 PENDING 子單的顧客。
 * 冪等：已有同 `(kind, ref_id = preorder.id)` 的 SENT 紀錄就跳過。
 */
export async function pickupReminder(
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number }> {
  const today = todayInTaipei(now)

  const days = await prisma.marketDay.findMany({
    where: { status: 'PUBLISHED', eventDate: new Date(`${today}T00:00:00.000Z`) },
  })
  if (days.length === 0) return { sent: 0, skipped: 0 }

  let sent = 0
  let skipped = 0

  for (const day of days) {
    // 該場所有還有 PENDING 子單的訂單
    const preorders = await prisma.preorder.findMany({
      where: { marketDayId: day.id, subOrders: { some: { status: 'PENDING' } } },
      include: {
        user: { select: { id: true, lineUserId: true } },
        subOrders: {
          where: { status: 'PENDING' },
          include: { stall: { select: { name: true } } },
        },
      },
    })

    for (const preorder of preorders) {
      const already = await prisma.notification.findFirst({
        where: { kind: 'PICKUP_REMINDER', refId: preorder.id, status: 'SENT' },
      })
      if (already) {
        skipped += 1
        continue
      }

      const messages = pickupReminderMessage({
        eventDate: dateToIsoDate(day.eventDate),
        stalls: preorder.subOrders.map((so) => ({
          name: so.stall.name,
          pickupCode: so.pickupCode,
        })),
        pickupAt: timeToHhmm(preorder.pickupAt),
        preorderId: preorder.id,
      })

      try {
        const result = await send({
          kind: 'PICKUP_REMINDER',
          refId: preorder.id,
          targets: [{ userId: preorder.user.id, lineUserId: preorder.user.lineUserId }],
          messages,
        })
        sent += result.sent
      } catch (err) {
        // 額度不足：sender 已寫 SKIPPED_QUOTA，這裡不再重試，也不中斷其他人
        if (!(err instanceof AppError && err.code === 'QUOTA_EXCEEDED')) throw err
        skipped += 1
      }
    }
  }

  return { sent, skipped }
}
