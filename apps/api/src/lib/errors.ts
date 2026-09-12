import { ERROR_HTTP_STATUS, type ApiErrorBody, type ErrorCode } from '@market/shared'

/**
 * 全站錯誤型別。route／service 一律 throw AppError，
 * 由 plugins/error.ts 轉成 03 §12 的統一回應格式。
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly extra: Omit<ApiErrorBody, 'error' | 'message'>

  constructor(
    code: ErrorCode,
    message?: string,
    extra: Omit<ApiErrorBody, 'error' | 'message'> = {},
  ) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.statusCode = ERROR_HTTP_STATUS[code]
    this.extra = extra
  }
}

export const unauthenticated = (message?: string) =>
  new AppError('UNAUTHENTICATED', message ?? '請先登入')

/** 403 回應體不得含任何目標資源資料（03 §前言） */
export const forbidden = (message?: string) =>
  new AppError('FORBIDDEN', message ?? '沒有權限')

export const notFound = (message?: string) =>
  new AppError('NOT_FOUND', message ?? '找不到資料')
