import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { MeResponse } from '@market/shared'
import { toMessage } from '@/api/useApi'
import { useImpersonation } from '@/store/impersonation'
import { useSession } from '@/store/session'
import { FormError } from './form'
import Sheet from './Sheet'

/** 身分說明：帳號面板與 ☰ 選單共用 */
export function identityLabel(me: MeResponse): string {
  return me.capabilities.operator
    ? '市集主辦方（管理員）'
    : me.stalls.length > 0
      ? `攤商：${me.stalls.map((s) => s.name).join('、')}`
      : '顧客'
}

/** 登出：帳號面板與 ☰ 選單共用 */
export function useSignOut() {
  const { logout } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return { signOut, busy, error }
}

/** 頭像：有 LINE 大頭貼就用，沒有就顯示名字第一個字 */
export function Avatar({ me, size = 'md' }: { me: MeResponse; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-[15px]'
  return me.pictureUrl ? (
    <img
      src={me.pictureUrl}
      alt=""
      className={`${box} shrink-0 rounded-full border-2 border-brand-100 object-cover`}
    />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full border-2 border-brand-100 bg-brand-50 font-bold text-brand-700`}
    >
      {(me.displayName || '我').slice(0, 1)}
    </span>
  )
}

/**
 * ⚠️ 規格外：登入／登出入口（委託方 2026-09-13 指示）。
 *
 * 三個 View 的頁首共用同一顆：未登入顯示「登入」，已登入顯示頭像（或名字），
 * 點開後有身分說明、各區捷徑與登出。
 */
export default function AuthMenu({ variant = 'text' }: { variant?: 'text' | 'avatar' }) {
  const { me } = useSession()
  const { active } = useImpersonation()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const { signOut, busy, error } = useSignOut()

  // 模擬中不顯示：登出會連 mp_impersonator 一起清掉，管理員就回不到原本帳號了。
  // 那個狀態下畫面最上面本來就有黃色列的「結束模擬」，出口已經有了。
  if (active) return null

  if (!me) {
    const redirect = `${location.pathname}${location.search}`
    return (
      <Link
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        className={
          variant === 'avatar'
            ? 'inline-flex min-h-11 shrink-0 items-center rounded-full border border-neutral-100 bg-white px-4 text-sm font-medium text-neutral-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)]'
            : 'shrink-0 text-sm text-neutral-600'
        }
      >
        登入
      </Link>
    )
  }

  const inBackstage =
    location.pathname.startsWith('/stall') || location.pathname.startsWith('/operator')

  return (
    <>
      {variant === 'avatar' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`帳號：${me.displayName || '我的帳號'}`}
          className="shrink-0 rounded-full"
        >
          <Avatar me={me} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="max-w-24 shrink-0 truncate rounded-lg px-1 text-sm text-neutral-600 active:bg-neutral-100"
        >
          {me.displayName || '我的帳號'}
        </button>
      )}

      {open ? (
        <Sheet title="帳號" onClose={() => setOpen(false)}>
          <div className="rounded-xl bg-neutral-100 px-3 py-2.5">
            <p className="text-sm font-medium">{me.displayName || '（未命名）'}</p>
            <p className="mt-0.5 text-xs text-neutral-600">{identityLabel(me)}</p>
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
