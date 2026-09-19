// 狀態列舉（02-資料模型.md §C）：前後端共用的唯一來源。

export const MarketDayStatus = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const
export const ListingStatus = ['ON_SALE', 'SOLD_OUT', 'OFF_SHELF'] as const
/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：上架審核。
 * 審核關閉時一律 APPROVED；開啟時攤商新上架的商品進 PENDING_REVIEW，
 * 管理員通過才會出現在顧客端。
 */
export const ListingApproval = ['APPROVED', 'PENDING_REVIEW', 'REJECTED'] as const
/**
 * ⚠️ 偏離 02 §C（委託方 2026-09-20 指示）：
 * 下單後先進 PENDING_CONFIRM（店家確認中），店家確認了才是 PENDING（訂單成立）。
 */
export const SubOrderStatus = [
  'PENDING_CONFIRM',
  'PENDING',
  'PICKED_UP',
  'NO_SHOW',
  'CANCELLED',
] as const
export const InviteStatus = ['ACTIVE', 'REDEEMED', 'EXPIRED', 'RECYCLED'] as const
export const ComposeMode = ['OPERATOR_COMPOSE', 'STALL_COMPOSE'] as const
export const Audience = ['ALL_FRIENDS', 'MARKET_DAY_CUSTOMERS', 'STALL_CUSTOMERS'] as const
export const BroadcastStatus = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'SENT',
  'FAILED',
] as const
export const NotificationKind = ['NEW_ORDER', 'PICKUP_REMINDER', 'BROADCAST'] as const
export const NotificationStatus = ['QUEUED', 'SENT', 'FAILED', 'SKIPPED_QUOTA'] as const
export const UserRole = ['user', 'operator'] as const

/**
 * ⚠️ 取貨碼格式已改為 {攤商位置}-{3 位流水號}（委託方 2026-09-13 指示），
 * 這兩個常數不再用於產碼，保留是因為 02 §C 的列舉清單有列出。
 */
export const PICKUP_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const PICKUP_CODE_LENGTH = 4
/**
 * ⚠️ 規格外的容量上限（委託方 2026-09-20 指示）。
 * 實際生效的值存在 system_setting，這裡只是初始預設。
 */
export const DEFAULT_MAX_PRODUCTS_PER_STALL = 10
export const DEFAULT_MAX_STALLS = 200

/** 取貨碼流水號位數 */
export const PICKUP_SERIAL_DIGITS = 3

export type MarketDayStatus = (typeof MarketDayStatus)[number]
export type ListingStatus = (typeof ListingStatus)[number]
export type ListingApproval = (typeof ListingApproval)[number]
export type SubOrderStatus = (typeof SubOrderStatus)[number]
export type InviteStatus = (typeof InviteStatus)[number]
export type ComposeMode = (typeof ComposeMode)[number]
export type Audience = (typeof Audience)[number]
export type BroadcastStatus = (typeof BroadcastStatus)[number]
export type NotificationKind = (typeof NotificationKind)[number]
export type NotificationStatus = (typeof NotificationStatus)[number]
export type UserRole = (typeof UserRole)[number]
