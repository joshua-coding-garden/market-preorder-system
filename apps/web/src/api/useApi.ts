import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './client'
import { errorMessage } from '@/i18n/zh-TW'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * 讀取型 API 的共用 hook：載入中／空資料／錯誤三種狀態（05 §前言）。
 * path 為 null 時不發請求（等其他資料就緒）。
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (path === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err instanceof ApiError ? err.code : undefined))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { data, loading, error, reload }
}

/** 把 ApiError 轉成可顯示的中文訊息；VALIDATION 會帶出第一個欄位訊息 */
export function toMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION') {
      const issue = (err.body.issues as { message?: string }[] | undefined)?.[0]
      return issue?.message ?? err.message ?? errorMessage('VALIDATION')
    }
    return err.message || errorMessage(err.code)
  }
  return '發生錯誤，請稍後再試'
}
