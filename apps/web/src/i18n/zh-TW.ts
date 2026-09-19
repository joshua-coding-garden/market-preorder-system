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
  // ⚠️ 規格外（2026-09-20 指示）
  PRODUCT_LIMIT_REACHED: '商品數已達上限，請先下架用不到的商品',
  STALL_LIMIT_REACHED: '攤商數已達上限',
  NOT_CONFIRMED: '這筆訂單店家還沒確認',
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
  // ⚠️ 規格外（2026-09-20 指示）：店家確認了才算訂單成立
  PENDING_CONFIRM: '店家確認中',
  PENDING: '待取貨',
  PICKED_UP: '已取貨',
  NO_SHOW: '未取',
  CANCELLED: '已取消',
}

export const broadcastStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待審核',
  APPROVED: '已核准',
  REJECTED: '已退回',
  SENT: '已送出',
  FAILED: '送出失敗',
}

/** ⚠️ 規格外（2026-09-20 指示）：上架審核狀態 */
export const listingApprovalLabel: Record<string, string> = {
  APPROVED: '已上架',
  PENDING_REVIEW: '待審核',
  REJECTED: '已退回',
}
