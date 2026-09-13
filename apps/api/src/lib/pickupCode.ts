import type { Prisma } from '@prisma/client'

/**
 * 取貨碼
 *
 * ⚠️ 偏離 D-02（委託方 2026-09-13 指示）：
 * 原規格是「4 碼亂碼、字元集 23456789ABCDEFGHJKMNPQRSTUVWXYZ」，
 * 改成 **{攤商位置}-{3 位流水號}**，例：`B03-001`。
 *
 * 流水號在「同一場次同一攤位」內從 001 起算，因此：
 *   - `UNIQUE(market_day_id, pickup_code)` 仍成立
 *     （participation 保證同場次 booth_no 唯一，跨攤前綴必不同）
 *   - 「每日刷新」自然成立（流水號按場次計算）
 *   - 顧客一眼看得出要去哪一攤，攤商也能從號碼判斷是不是自己的
 */

export const PICKUP_SERIAL_DIGITS = 3
export const PICKUP_CODE_MAX_ATTEMPTS = 25

/** 組出取貨碼字串 */
export function buildPickupCode(boothNo: string, serial: number): string {
  return `${boothNo}-${String(serial).padStart(PICKUP_SERIAL_DIGITS, '0')}`
}

/** 從取貨碼取出流水號；格式不符回 0 */
export function serialOf(code: string): number {
  const m = /-(\d+)$/.exec(code)
  return m ? Number(m[1]) : 0
}

/**
 * 算出某攤在某場次的下一個流水號。
 * 取現有最大流水號 + 1，而不是筆數 —— 訂單被刪或補建時才不會撞號。
 */
export async function nextPickupSerial(
  tx: Prisma.TransactionClient,
  marketDayId: string,
  stallId: string,
): Promise<number> {
  const existing = await tx.subOrder.findMany({
    where: { marketDayId, stallId },
    select: { pickupCode: true },
  })
  return existing.reduce((max, so) => Math.max(max, serialOf(so.pickupCode)), 0) + 1
}

/**
 * 顧客可能只念流水號（「零零三」），所以核銷輸入允許三種寫法：
 *   `B03-001`、`b03-1`、`1`
 * 一律正規化成完整的取貨碼再查。
 */
export function normalizePickupCode(input: string, boothNo: string): string {
  const raw = input.trim().toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''

  // 只輸入數字 → 補上自己的攤位前綴
  if (/^\d+$/.test(raw)) return buildPickupCode(boothNo.toUpperCase(), Number(raw))

  // 有前綴但流水號沒補零 → 補齊
  const m = /^(.+)-(\d+)$/.exec(raw)
  if (m) return buildPickupCode(m[1], Number(m[2]))

  return raw
}
