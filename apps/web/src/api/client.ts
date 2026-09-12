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

/** 呼叫後端 API；session 走 httpOnly cookie，因此一律帶 credentials */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers:
      init.body && !(init.body instanceof FormData)
        ? { 'content-type': 'application/json', ...init.headers }
        : init.headers,
    ...init,
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
