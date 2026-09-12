// 狀態列舉（02-資料模型.md §C）：前後端共用的唯一來源。

export const MarketDayStatus = ['DRAFT', 'PUBLISHED', 'CLOSED'] as const
export const ListingStatus = ['ON_SALE', 'SOLD_OUT', 'OFF_SHELF'] as const
export const SubOrderStatus = ['PENDING', 'PICKED_UP', 'NO_SHOW', 'CANCELLED'] as const
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

/** 取貨碼字元集（D-02）：去掉易混淆的 0/O/1/I/L/U/V */
export const PICKUP_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
/** 取貨碼長度（D-02） */
export const PICKUP_CODE_LENGTH = 4

export type MarketDayStatus = (typeof MarketDayStatus)[number]
export type ListingStatus = (typeof ListingStatus)[number]
export type SubOrderStatus = (typeof SubOrderStatus)[number]
export type InviteStatus = (typeof InviteStatus)[number]
export type ComposeMode = (typeof ComposeMode)[number]
export type Audience = (typeof Audience)[number]
export type BroadcastStatus = (typeof BroadcastStatus)[number]
export type NotificationKind = (typeof NotificationKind)[number]
export type NotificationStatus = (typeof NotificationStatus)[number]
export type UserRole = (typeof UserRole)[number]
