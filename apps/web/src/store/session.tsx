import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MeResponse } from '@market/shared'
import { ApiError, api } from '@/api/client'
import { initLiff, loginWithLiff } from '@/lib/liff'

interface SessionState {
  me: MeResponse | null
  loading: boolean
  /** 重新抓取 /me（登入後、綁定攤商後呼叫） */
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

/** 抓 /me；401 代表未登入，不是錯誤 */
async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>('/me')
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    try {
      setMe(await fetchMe())
    } finally {
      setLoading(false)
    }
  }

  /**
   * 首次載入（0916 入口流程）：
   * LIFF 初始化與 /me 同時進行；LIFF 會把 liff.state 還原成原本要去的路徑。
   * 若尚未登入且是從 LINE 內開啟，就用 LIFF 的 ID token 自動換 session，
   * 使用者從歡迎訊息點進來不用再按登入。
   */
  const bootstrap = async (): Promise<void> => {
    try {
      const [liffReady, current] = await Promise.all([initLiff(), fetchMe()])
      if (current || !liffReady) {
        setMe(current)
        return
      }
      setMe((await loginWithLiff()) ? await fetchMe() : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  const value = useMemo<SessionState>(
    () => ({
      me,
      loading,
      refresh: load,
      logout: async () => {
        await api.post('/auth/logout')
        setMe(null)
      },
    }),
    [me, loading],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必須在 SessionProvider 之內使用')
  return ctx
}
