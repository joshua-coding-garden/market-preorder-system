// 文案（05-畫面規格.md §文案）。UI 文字一律繁體中文。
import type { ErrorCode } from '@market/shared'

export const errorMessages: Record<string, string> = {
  MARKET_DAY_CLOSED: '本場次預購已截止',
  CART_EMPTY: '購物車是空的',
  LISTING_UNAVAILABLE: '有商品已售完或下架，請先移除',
  LISTING_LIMIT_EXCEEDED: '超過可預購數量',
  INVITE_INVALID: '邀請碼無效或已使用',
  PICKUP_CODE_NOT_FOUND: '查無此取貨碼',
  ALREADY_PICKED_UP: '此筆已完成取貨',
  QUOTA_EXCEEDED: '本月訊息額度不足，無法送出',
  PRODUCT_CODE_DUPLICATE: '商品代碼重複',
  FORBIDDEN: '沒有權限',
  UNAUTHENTICATED: '請先使用 LINE 登入',
  NOT_FOUND: '找不到資料',
  VALIDATION: '輸入內容有誤，請檢查後再送出',
}

export function errorMessage(code: ErrorCode | string | undefined): string {
  if (!code) return '發生錯誤，請稍後再試'
  return errorMessages[code] ?? '發生錯誤，請稍後再試'
}

export const marketDayStatusLabel: Record<string, string> = {
  DRAFT: '未發布',
  PUBLISHED: '已發布',
  CLOSED: '已結案',
}

export const subOrderStatusLabel: Record<string, string> = {
  PENDING: '待取貨',
  PICKED_UP: '已取貨',
  NO_SHOW: '未取',
  CANCELLED: '已取消',
}
