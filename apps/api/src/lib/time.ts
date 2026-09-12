/**
 * 時間轉換（02 §E）。
 * - DB 的 `time` 欄位由 Prisma 以 1970-01-01 的 Date 表示，時間部分存在 UTC 欄位上。
 * - DB 的 `date` 欄位由 Prisma 以該日 UTC 午夜的 Date 表示。
 * - 台北固定 UTC+8，無日光節約時間。
 */

export const TAIPEI_OFFSET_MINUTES = 8 * 60

/** "HH:mm" → Prisma `time` 欄位用的 Date */
export function hhmmToTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(1970, 0, 1, h ?? 0, m ?? 0, 0, 0))
}

/** Prisma `time` 欄位的 Date → "HH:mm" */
export function timeToHhmm(value: Date): string {
  const h = String(value.getUTCHours()).padStart(2, '0')
  const m = String(value.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/** "YYYY-MM-DD" → Prisma `date` 欄位用的 Date */
export function isoDateToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Prisma `date` 欄位的 Date → "YYYY-MM-DD" */
export function dateToIsoDate(value: Date): string {
  const y = value.getUTCFullYear()
  const m = String(value.getUTCMonth() + 1).padStart(2, '0')
  const d = String(value.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 台北當地日期＋時間 → UTC 時刻 */
export function taipeiToUtc(isoDate: string, hhmmss = '00:00:00'): Date {
  const parts = hhmmss.split(':').map(Number)
  const [h = 0, m = 0, s = 0] = parts
  const asUtc = Date.parse(`${isoDate}T00:00:00.000Z`)
  return new Date(asUtc + (h * 60 + m - TAIPEI_OFFSET_MINUTES) * 60_000 + s * 1000)
}

/** 現在的台北當地日期 "YYYY-MM-DD" */
export function todayInTaipei(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_MINUTES * 60_000)
  return dateToIsoDate(shifted)
}

/** 台北當地日期加減天數 */
export function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return dateToIsoDate(base)
}
