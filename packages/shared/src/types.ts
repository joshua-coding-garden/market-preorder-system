// API 回應型別（前端 fetch 封裝共用）。
import type { MarketDayStatus, UserRole } from './enums.js'

export interface StallBrief {
  id: string
  name: string
}

/** GET /me（03 §1） */
export interface MeResponse {
  id: string
  displayName: string
  pictureUrl: string | null
  phone: string | null
  role: UserRole
  stalls: StallBrief[]
  capabilities: {
    customer: true
    stall: boolean
    operator: boolean
  }
}

export interface MarketBrief {
  id: string
  code: string
  name: string
  location: string
}

/** GET /market-days 的單筆 */
export interface MarketDayListItem {
  id: string
  market: MarketBrief
  /** YYYY-MM-DD（台北當地日期） */
  eventDate: string
  /** HH:mm */
  openTime: string
  /** HH:mm */
  closeTime: string
  /** ISO 8601 UTC */
  orderDeadline: string
  locationNote: string | null
  status: MarketDayStatus
  stallCount: number
}

export interface ParticipationBrief {
  id: string
  boothNo: string
  stall: StallBrief & { description: string | null; logoUrl: string | null }
}

/** GET /market-days/:id */
export interface MarketDayDetail extends MarketDayListItem {
  participations: ParticipationBrief[]
}

export interface Paged<T> {
  items: T[]
  nextCursor: string | null
}
