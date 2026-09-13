import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toMessage } from '@/api/useApi'
import { useImpersonation } from '@/store/impersonation'
import { useSession } from '@/store/session'
import { FormError } from './form'
import Sheet from './Sheet'

/**
 * ⚠️ 規格外：登入／登出入口（委託方 2026-09-13 指示）。
 *
 * 三個 View 的標題列共用同一顆：未登入顯示「登入」，已登入顯示名字，
 * 點開後有身分說明、各區捷徑與登出。
 */
export default function AuthMenu() {
  const { me, logout } = useSession()
  const { active } = useImpersonation()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 模擬中不顯示：登出會連 mp_impersonator 一起清掉，管理員就回不到原本帳號了。
  // 那個狀態下畫面最上面本來就有黃色列的「結束模擬」，出口已經有了。
  if (active) return null

  if (!me) {
    const redirect = `${location.pathname}${location.search}`
    return (
      <Link
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        className="shrink-0 text-sm text-neutral-600"
      >
        登入
      </Link>
    )
  }

  const inBackstage =
    location.pathname.startsWith('/stall') || location.pathname.startsWith('/operator')

  const identity = me.capabilities.operator
    ? '市集主辦方（管理員）'
    : me.stalls.length > 0
      ? `攤商：${me.stalls.map((s) => s.name).join('、')}`
      : '顧客'

  const signOut = async () => {
    setBusy(true)
    setError(null)
    try {
      await logout()
      // 身分整個換掉，整頁重載最單純：不會留下購物車之類的殘狀態，
      // 也不會發生「按鈕把自己所在的 layout 卸載掉」（攤商頁與後台頁有權限守衛）。
      window.location.href = '/'
    } catch (err) {
      setError(toMessage(err))
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="max-w-24 shrink-0 truncate rounded-lg px-1 text-sm text-neutral-600 active:bg-neutral-100"
      >
        {me.displayName || '我的帳號'}
      </button>

      {open ? (
        <Sheet title="帳號" onClose={() => setOpen(false)}>
          <div className="rounded-xl bg-neutral-100 px-3 py-2.5">
            <p className="text-sm font-medium">{me.displayName || '（未命名）'}</p>
            <p className="mt-0.5 text-xs text-neutral-600">{identity}</p>
          </div>

          <div className="mt-3 space-y-2">
            {/* 攤商／後台的標題列窄，「回顧客頁」收進這裡，不再佔一格 */}
            {inBackstage ? (
              <MenuLink to="/" onGo={() => setOpen(false)}>
                回顧客頁
              </MenuLink>
            ) : null}
            <MenuLink to="/orders" onGo={() => setOpen(false)}>
              我的訂單
            </MenuLink>
            {me.capabilities.stall ? (
              <MenuLink to="/stall" onGo={() => setOpen(false)}>
                攤商專區
              </MenuLink>
            ) : null}
            {me.capabilities.operator ? (
              <MenuLink to="/operator" onGo={() => setOpen(false)}>
                市集後台
              </MenuLink>
            ) : null}
          </div>

          <FormError message={error} />

          <button
            type="button"
            className="btn-secondary mt-4 w-full"
            disabled={busy}
            onClick={() => void signOut()}
          >
            {busy ? '登出中…' : '登出'}
          </button>
        </Sheet>
      ) : null}
    </>
  )
}

function MenuLink({
  to,
  onGo,
  children,
}: {
  to: string
  onGo: () => void
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      onClick={onGo}
      className="block rounded-xl border border-neutral-200 px-3 py-3 text-sm active:bg-neutral-50"
    >
      {children}
    </Link>
  )
}
