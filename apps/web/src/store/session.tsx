import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MeResponse } from '@market/shared'
import { ApiError, api } from '@/api/client'

interface SessionState {
  me: MeResponse | null
  loading: boolean
  /** 重新抓取 /me（登入後、綁定攤商後呼叫） */
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    try {
      setMe(await api.get<MeResponse>('/me'))
    } catch (err) {
      // 401 代表未登入，不是錯誤
      if (err instanceof ApiError && err.status === 401) setMe(null)
      else throw err
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
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
