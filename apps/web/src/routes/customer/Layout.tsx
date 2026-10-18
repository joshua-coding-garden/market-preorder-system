import { useCallback, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import AuthMenu, { Avatar, identityLabel, useSignOut } from '@/components/AuthMenu'
import Drawer, {
  DrawerButton,
  DrawerFooter,
  DrawerHeader,
  DrawerLink,
  DrawerSection,
} from '@/components/Drawer'
import { FormError } from '@/components/form'
import { HowItWorksSheet } from '@/components/HowItWorks'
import { MenuButton } from '@/components/Shell'
import { useImpersonation } from '@/store/impersonation'
import { useSession } from '@/store/session'

/**
 * 顧客 View 外框（05 §顧客 View）。
 * ⚠️ 規格外（2026-10-18 指示，參考 OnlineMenu）：頂端改成 ☰＋品牌＋頭像，
 * 原本頁尾的「攤商專區／廠商後台」移進 ☰ 選單的「我的身分」。
 */
export default function CustomerLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-neutral-50">
      <div className="flex items-center gap-3 px-4 pt-3">
        <MenuButton onClick={() => setMenuOpen(true)} />
        <Link to="/" className="min-w-0 flex-1 truncate text-lg font-bold text-brand-600">
          市集預購
        </Link>
        <AuthMenu variant="avatar" />
      </div>

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {menuOpen ? (
        <CustomerMenu
          onClose={closeMenu}
          onHow={() => {
            setMenuOpen(false)
            setHowOpen(true)
          }}
        />
      ) : null}
      {howOpen ? <HowItWorksSheet onClose={() => setHowOpen(false)} /> : null}
    </div>
  )
}

function CustomerMenu({ onClose, onHow }: { onClose: () => void; onHow: () => void }) {
  const { me } = useSession()
  const { active: impersonating } = useImpersonation()
  const { signOut, busy, error } = useSignOut()

  return (
    <Drawer label="選單" onClose={onClose}>
      <DrawerHeader title="市集預購" onClose={onClose} />

      <div className="mt-5 flex flex-col items-center gap-1.5 px-1 text-center">
        {me ? (
          <>
            <Avatar me={me} size="lg" />
            <p className="text-[15px] font-bold">{me.displayName || '（未命名）'}</p>
            <p className="text-xs text-neutral-500">{identityLabel(me)}</p>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-brand-100 bg-brand-50 text-sm font-bold text-brand-700">
              訪客
            </span>
            <p className="text-sm font-medium text-brand-700">未登入</p>
          </>
        )}
      </div>

      <DrawerSection label="逛市集">
        <DrawerLink to="/" icon="pin" end onGo={onClose}>
          市集列表
        </DrawerLink>
        <DrawerLink to="/orders" icon="receipt" onGo={onClose}>
          我的訂單
          {me ? null : <span className="ml-2 text-xs text-neutral-400">需登入</span>}
        </DrawerLink>
        <DrawerButton icon="help" onClick={onHow}>
          怎麼預購
        </DrawerButton>
      </DrawerSection>

      {me?.capabilities.stall || me?.capabilities.operator ? (
        <DrawerSection label="我的身分">
          {me.capabilities.stall ? (
            <DrawerLink to="/stall" icon="store" onGo={onClose}>
              攤商專區
            </DrawerLink>
          ) : null}
          {me.capabilities.operator ? (
            <DrawerLink to="/operator" icon="dashboard" onGo={onClose}>
              市集後台
            </DrawerLink>
          ) : null}
        </DrawerSection>
      ) : null}

      <DrawerFooter>
        {me ? (
          // 模擬中不給登出：會連原本的管理員身分一起清掉（理由同 AuthMenu）
          impersonating ? null : (
            <>
              <DrawerButton icon="logout" danger disabled={busy} onClick={() => void signOut()}>
                {busy ? '登出中…' : '登出'}
              </DrawerButton>
              <FormError message={error} />
            </>
          )
        ) : (
          <DrawerLink to="/login" icon="logout" onGo={onClose}>
            登入
          </DrawerLink>
        )}
      </DrawerFooter>
    </Drawer>
  )
}
