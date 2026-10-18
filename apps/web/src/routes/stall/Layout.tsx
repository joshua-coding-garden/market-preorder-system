import { useCallback, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useMatch } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { Avatar, useSignOut } from '@/components/AuthMenu'
import Drawer, {
  DrawerButton,
  DrawerFooter,
  DrawerHeader,
  DrawerLink,
  DrawerSection,
} from '@/components/Drawer'
import { FormError } from '@/components/form'
import { Icon } from '@/components/icons'
import { ShellProvider } from '@/components/Shell'
import { useImpersonation } from '@/store/impersonation'
import { useSession } from '@/store/session'

/**
 * 攤商 View 外框（05 §攤商 View）。
 *
 * ⚠️ 規格外（2026-10-18 指示，參考 OnlineMenu）：
 * - 拿掉原本的標題列，改成每頁頁首的「☰＋大字頁名＋帳號」，功能分組收進 ☰ 選單
 * - 管理員從後台進來代管別人的攤時，頂端顯示黃色提示，一鍵回市集後台
 */
export default function StallLayout() {
  const { me } = useSession()
  const match = useMatch('/stall/:stallId/*')
  const fromUrl = match?.params.stallId
  // /stall/redeem 是獨立路由，不是攤商 id
  const stallId = fromUrl && fromUrl !== 'redeem' ? fromUrl : (me?.stalls[0]?.id ?? null)

  const member = me?.stalls.find((s) => s.id === stallId)
  const proxying = !!me?.capabilities.operator && !!stallId && !member
  const profile = useApi<{ name: string }>(proxying ? `/stalls/${stallId}` : null)
  const stallName = member?.name ?? profile.data?.name ?? null

  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const shell = useMemo(() => ({ openMenu: () => setMenuOpen(true) }), [])

  return (
    <ShellProvider value={shell}>
      <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-neutral-50">
        {proxying ? (
          <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-100 py-1.5 pl-4 pr-2">
            <p className="min-w-0 truncate text-sm text-amber-900">
              管理員代管中：<span className="font-bold">{stallName ?? '…'}</span>
            </p>
            <Link
              to="/operator/stalls"
              className="inline-flex min-h-9 shrink-0 items-center gap-0.5 rounded-full border border-amber-300 bg-white px-2.5 text-sm font-medium text-amber-800"
            >
              <Icon name="back" size={16} strokeWidth={2.2} />
              回市集後台
            </Link>
          </div>
        ) : null}

        <main className="flex-1 pb-16">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <StallMenu
          stallId={stallId}
          stallName={stallName}
          proxying={proxying}
          onClose={closeMenu}
        />
      ) : null}
    </ShellProvider>
  )
}

function StallMenu({
  stallId,
  stallName,
  proxying,
  onClose,
}: {
  stallId: string | null
  stallName: string | null
  proxying: boolean
  onClose: () => void
}) {
  const { me } = useSession()
  const { active: impersonating } = useImpersonation()
  const { signOut, busy, error } = useSignOut()
  const { pathname } = useLocation()

  const base = stallId ? `/stall/${stallId}` : null
  // 場次的四個子頁與訂單詳情都算在「我的場次」底下
  const inDays =
    !!base &&
    (pathname === base || pathname.startsWith(`${base}/days/`) || pathname.startsWith(`${base}/sub-orders/`))

  return (
    <Drawer label="攤商選單" onClose={onClose}>
      <DrawerHeader title="攤商專區" onClose={onClose} />

      {me ? (
        <div className="mx-1 mt-5 flex items-center gap-3">
          <Avatar me={me} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium">{me.displayName || '（未命名）'}</p>
            {proxying ? (
              <p className="truncate text-xs text-amber-800">代管：{stallName ?? '…'}</p>
            ) : (
              <p className="truncate text-xs text-neutral-500">{stallName ?? '尚未綁定攤商'}</p>
            )}
          </div>
        </div>
      ) : null}

      {/* 綁了好幾攤時在這裡切換 */}
      {me && me.stalls.length > 1 ? (
        <div className="mx-1 mt-3 flex flex-wrap gap-1.5">
          {me.stalls.map((s) => (
            <Link
              key={s.id}
              to={`/stall/${s.id}`}
              onClick={onClose}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                s.id === stallId
                  ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                  : 'border-neutral-200 text-neutral-700'
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      ) : null}

      {base ? (
        <DrawerSection label="營業">
          <DrawerLink to={base} icon="calendar" active={inDays} onGo={onClose}>
            我的場次
          </DrawerLink>
          <DrawerLink to={`${base}/products`} icon="box" onGo={onClose}>
            商品管理
          </DrawerLink>
          <DrawerLink to={`${base}/broadcasts`} icon="megaphone" onGo={onClose}>
            推播申請
          </DrawerLink>
        </DrawerSection>
      ) : null}

      <DrawerSection label="設定">
        {base ? (
          <DrawerLink to={`${base}/profile`} icon="store" onGo={onClose}>
            基本資料
          </DrawerLink>
        ) : null}
        <DrawerLink to="/stall/redeem" icon="ticket" onGo={onClose}>
          輸入邀請碼
        </DrawerLink>
      </DrawerSection>

      <DrawerFooter>
        {me?.capabilities.operator ? (
          <DrawerLink to="/operator" icon="dashboard" end onGo={onClose}>
            回市集後台
          </DrawerLink>
        ) : null}
        <DrawerLink to="/" icon="home" end onGo={onClose}>
          回顧客頁
        </DrawerLink>
        {/* 模擬中不給登出：會連原本的管理員身分一起清掉（理由同 AuthMenu） */}
        {me && !impersonating ? (
          <DrawerButton icon="logout" danger disabled={busy} onClick={() => void signOut()}>
            {busy ? '登出中…' : '登出'}
          </DrawerButton>
        ) : null}
        <FormError message={error} />
      </DrawerFooter>
    </Drawer>
  )
}
