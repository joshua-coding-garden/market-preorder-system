/**
 * 台北時區的輸入／顯示轉換（02 §E）。
 * 台北固定 UTC+8，無日光節約時間，因此用固定位移即可，不依賴瀏覽器時區。
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000

/** `<input type="datetime-local">` 的值（台北當地）→ ISO 8601 UTC */
export function taipeiLocalToUtcIso(local: string): string {
  // local 形如 "2026-09-14T22:00"
  const asUtc = Date.parse(`${local}:00.000Z`)
  return new Date(asUtc - TAIPEI_OFFSET_MS).toISOString()
}

/** ISO 8601 UTC → `<input type="datetime-local">` 的值（台北當地） */
export function utcIsoToTaipeiLocal(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + TAIPEI_OFFSET_MS)
  return shifted.toISOString().slice(0, 16)
}

/** 今天（台北）的 YYYY-MM-DD */
export function todayInTaipei(): string {
  return new Date(Date.now() + TAIPEI_OFFSET_MS).toISOString().slice(0, 10)
}

/** YYYY-MM-DD 加天數 */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
