import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { goToLogin } from '@/api/client'
import { Spinner } from '@/components/common'
import { isInLine } from '@/lib/liff'
import { useSession } from '@/store/session'

const LINE_LOGIN_TRIED = 'stall-line-login-tried'

/**
 * 路由守門（05 §前言）：
 *   /stall/*    需 capabilities.stall（operator 也通過）
 *   /operator/* 需 capabilities.operator
 * 這只是體驗，後端一律另行檢查（B-1、B-2）。
 *
 * 規格外（2026-10-31）：還不是攤商成員的人進 /stall/* 直接導到輸入邀請碼。
 * 歡迎訊息不附按鈕之後，新攤商是從圖文選單的「攤商專區」進來。
 *
 * 規格外（2026-10-31）：在 LINE 外開 /stall/* 且沒登入時，直接送 LINE 登入，不經過 C9。
 * 電腦版 LINE 用外部瀏覽器開圖文選單，C9 是顧客文案，攤商會以為點錯。
 * LINE 內由 LIFF 自動登入，不走這裡。
 */
export function RequireCapability({
  capability,
  children,
}: {
  capability: 'customer' | 'stall' | 'operator'
  children: ReactNode
}) {
  const { me, loading, logout } = useSession()
  const location = useLocation()

  // 只在 session 載完時判斷一次：之後 me 變成 null 是登出，不能再送去登入。
  // 同一個分頁只送一次，登入回來還是沒有 session 就改顯示 C9，不會一直繞圈。
  const [autoLineLogin, setAutoLineLogin] = useState<boolean | null>(null)
  if (autoLineLogin === null && !loading) {
    const inStall = location.pathname === '/stall' || location.pathname.startsWith('/stall/')
    setAutoLineLogin(
      !me && inStall && !isInLine() && !sessionStorage.getItem(LINE_LOGIN_TRIED),
    )
  }

  useEffect(() => {
    if (!autoLineLogin) return
    sessionStorage.setItem(LINE_LOGIN_TRIED, '1')
    goToLogin('line', `${location.pathname}${location.search}`)
  }, [autoLineLogin, location.pathname, location.search])

  if (loading || autoLineLogin) return <Spinner />

  if (!me) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (!me.capabilities[capability]) {
    if (capability === 'stall') return <Navigate to="/stall/redeem" replace />

    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold text-neutral-800">沒有權限</p>
        <p className="mt-2 text-sm text-neutral-500">此區域僅限市集主辦單位使用。</p>
        {/* 沒有這排的話，換成低權限帳號登入就會困在這頁出不去 */}
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Link to="/" className="text-brand-600">
            回首頁
          </Link>
          <button
            type="button"
            className="text-neutral-500"
            onClick={() => {
              void logout().then(() => {
                window.location.href = '/'
              })
            }}
          >
            登出
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
