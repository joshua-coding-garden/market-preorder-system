import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/common'
import { useSession } from '@/store/session'

/**
 * 路由守門（05 §前言）：
 *   /stall/*    需 capabilities.stall（operator 也通過）
 *   /operator/* 需 capabilities.operator
 * 這只是體驗，後端一律另行檢查（B-1、B-2）。
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

  if (loading) return <Spinner />

  if (!me) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (!me.capabilities[capability]) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-lg font-semibold text-neutral-800">沒有權限</p>
        <p className="mt-2 text-sm text-neutral-500">
          {capability === 'stall'
            ? '您還不是攤商成員。請向主辦單位索取邀請碼後綁定。'
            : '此區域僅限市集主辦單位使用。'}
        </p>
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
