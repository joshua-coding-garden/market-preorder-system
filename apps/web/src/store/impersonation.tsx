import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '@/api/client'

interface Brief {
  id: string
  displayName: string
  role: 'user' | 'operator'
  stalls: { id: string; name: string }[]
}

interface ImpersonationState {
  active: boolean
  original: Brief | null
  target: Brief | null
  refresh: () => Promise<void>
  stop: () => Promise<void>
}

const Ctx = createContext<ImpersonationState | null>(null)

/**
 * ⚠️ 規格外：身分模擬狀態（委託方指示）。
 * 模擬「未登入」時 /me 會回 401，所以狀態要獨立於 session 之外查。
 */
export function ImpersonationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ active: boolean; original: Brief | null; target: Brief | null }>({
    active: false,
    original: null,
    target: null,
  })

  const refresh = useCallback(async () => {
    try {
      setState(await api.get('/auth/impersonation'))
    } catch {
      setState({ active: false, original: null, target: null })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const stop = useCallback(async () => {
    await api.delete('/auth/impersonation')
    // 還原後身分整個換掉，直接重載最單純也最不會有殘留狀態
    window.location.href = '/operator/permissions'
  }, [])

  return <Ctx.Provider value={{ ...state, refresh, stop }}>{children}</Ctx.Provider>
}

export function useImpersonation(): ImpersonationState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useImpersonation 必須在 ImpersonationProvider 之內使用')
  return ctx
}
