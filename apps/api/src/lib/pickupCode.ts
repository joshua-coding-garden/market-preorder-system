import { randomInt } from 'node:crypto'
import { PICKUP_ALPHABET, PICKUP_CODE_LENGTH } from '@market/shared'

/**
 * 取貨碼（D-02）：4 碼，字元集去掉易混淆的 0/O/1/I/L/U/V，
 * 在同一場次內唯一（`UNIQUE(market_day_id, pickup_code)`）＝「每日刷新」。
 *
 * 產碼策略：隨機產生 → 直接 insert → 撞到 unique 就重試。
 * 31^4 ≈ 92 萬組，單場訂單量遠低於此，這樣比先查再寫少一次查詢，
 * 而且天然不會有「查完到寫入之間被別人搶走」的競態。
 */

export const PICKUP_CODE_MAX_ATTEMPTS = 12

export function generatePickupCode(): string {
  let code = ''
  for (let i = 0; i < PICKUP_CODE_LENGTH; i += 1) {
    code += PICKUP_ALPHABET[randomInt(PICKUP_ALPHABET.length)]
  }
  return code
}
