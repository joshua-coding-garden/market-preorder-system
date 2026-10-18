import { useCallback, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useSignOut } from '@/components/AuthMenu'
import Drawer, {
  DrawerButton,
  DrawerFooter,
  DrawerHeader,
  DrawerLink,
  DrawerSection,
} from '@/components/Drawer'
import { FormError } from '@/components/form'
import type { IconName } from '@/components/icons'
import ImpersonatePicker from '@/components/ImpersonatePicker'
import { ShellProvider } from '@/components/Shell'
import { useImpersonation } from '@/store/impersonation'
import { useSession } from '@/store/session'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

/**
 * ⚠️ 規格外（2026-10-18 指示）：原本 9 個分頁平鋪，手機上會換成兩三行。
 * 改成依使用頻率分兩組，收進 ☰ 選單（桌機寬度常駐在左側）。
 */
const DAILY: NavItem[] = [
  { to: '/operator', label: '儀表板', icon: 'dashboard', end: true },
  { to: '/operator/days', label: '場次', icon: 'calendar' },
  { to: '/operator/stalls', label: '攤商', icon: 'store' },
  // ⚠️ 規格外（2026-09-20 指示）
  { to: '/operator/listings', label: '商品審核', icon: 'review' },
  { to: '/operator/broadcasts', label: '推播', icon: 'megaphone' },
  { to: '/operator/search', label: '搜尋', icon: 'search' },
]

const SETTINGS: NavItem[] = [
  { to: '/operator/markets', label: '市集', icon: 'pin' },
  { to: '/operator/permissions', label: '帳號與權限', icon: 'shield' },
  { to: '/operator/settings', label: '系統設定', icon: 'sliders' },
]

/** 廠商 CMS 外框（05 §廠商 View） */
export default function OperatorLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  // 桌機有常駐側欄，☰ 只在窄螢幕出現
  const shell = useMemo(
    () => ({ openMenu: () => setMenuOpen(true), menuButtonClassName: 'lg:hidden' }),
    [],
  )

  return (
    <ShellProvider value={shell}>
      <div className="mx-auto flex min-h-dvh max-w-screen-lg bg-neutral-50">
        <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white lg:block">
          <nav aria-label="市集後台選單" className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-3 pb-4 pt-3">
            <OperatorNav />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>

      {menuOpen ? (
        <Drawer label="市集後台選單" onClose={closeMenu}>
          <OperatorNav onClose={closeMenu} />
        </Drawer>
      ) : null}
    </ShellProvider>
  )
}

function OperatorNav({ onClose }: { onClose?: () => void }) {
  const { me } = useSession()
  const { active: impersonating } = useImpersonation()
  const { signOut, busy, error } = useSignOut()

  return (
    <>
      <DrawerHeader
        title="市集後台"
        subtitle={
          <span className="text-amber-800">
            {me?.displayName ? `${me.displayName}・` : ''}僅管理員可見
          </span>
        }
        onClose={onClose}
      />

      <DrawerSection label="每天會用">
        {DAILY.map((item) => (
          <DrawerLink key={item.to} to={item.to} icon={item.icon} end={item.end} onGo={onClose}>
            {item.label}
          </DrawerLink>
        ))}
      </DrawerSection>

      <DrawerSection label="設定">
        {SETTINGS.map((item) => (
          <DrawerLink key={item.to} to={item.to} icon={item.icon} onGo={onClose}>
            {item.label}
          </DrawerLink>
        ))}
      </DrawerSection>

      <DrawerFooter>
        {/* 不關選單：挑身分的面板是這顆按鈕自己開的，關掉選單會連面板一起卸載 */}
        <ImpersonatePicker variant="menu" selfId={me?.id} />
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
    </>
  )
}
