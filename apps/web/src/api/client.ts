import type { ApiErrorBody } from '@market/shared'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly body: ApiErrorBody

  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error)
    this.name = 'ApiError'
    this.status = status
    this.code = body.error
    this.body = body
  }
}

const NGROK_HOST = /\.ngrok(-free)?\.(app|dev|io)$/

/**
 * ngrok 免費方案會對「看起來像瀏覽器」的請求插入一頁警告，
 * 連 fetch 也會拿到 HTML 而不是 JSON。這個 header 是官方的 bypass 方式。
 * 只在 ngrok 網域下加，正式部署不受影響。
 * （網址列直接輸入或第三方轉址仍會看到警告頁，按一次「Visit Site」即可。）
 */
function tunnelHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  return NGROK_HOST.test(window.location.hostname)
    ? { 'ngrok-skip-browser-warning': 'true' }
    : {}
}

/** 呼叫後端 API；session 走 httpOnly cookie，因此一律帶 credentials */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isJsonBody = init.body && !(init.body instanceof FormData)
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(isJsonBody ? { 'content-type': 'application/json' } : {}),
      ...tunnelHeaders(),
      ...init.headers,
    },
  })

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    throw new ApiError(res.status, (json as ApiErrorBody) ?? { error: 'UNKNOWN' })
  }
  return json as T
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

/** 導向 LINE 登入（C9） */
export function goToLineLogin(redirect: string = window.location.pathname): void {
  window.location.href = `${BASE}/api/auth/line/start?redirect=${encodeURIComponent(redirect)}`
}
