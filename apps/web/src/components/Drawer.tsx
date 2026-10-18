import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './icons'

/**
 * ⚠️ 規格外（2026-10-18 指示，參考 OnlineMenu）：三個 View 共用的左側選單。
 *
 * 跟 `Sheet` 一樣要用 portal 掛到 body，理由見該檔註解。
 * 由呼叫端決定要不要渲染（開著才掛上），因此鎖捲動與 Esc 都在掛上時處理。
 */
export default function Drawer({
  label,
  onClose,
  children,
}: {
  label: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-neutral-900/45" onClick={onClose} role="presentation">
      <nav
        aria-label={label}
        className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col overflow-y-auto bg-white px-3 pb-4 pt-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </nav>
    </div>,
    document.body,
  )
}

/** 選單最上面：關閉鍵＋區域名稱。放在桌機常駐側欄時不傳 onClose，就不出現關閉鍵 */
export function DrawerHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string
  subtitle?: ReactNode
  onClose?: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-1">
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉選單"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-neutral-900"
        >
          <Icon name="menu" strokeWidth={2.2} />
        </button>
      ) : null}
      <div className="min-w-0">
        <p className="text-[17px] font-bold text-brand-600">{title}</p>
        {subtitle ? <p className="text-xs text-neutral-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}

export function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <p className="px-3 pb-1 text-xs font-medium text-neutral-500">{label}</p>
      {children}
    </div>
  )
}

const ITEM =
  'flex min-h-12 w-full items-center gap-3.5 rounded-xl px-3 text-left text-[15px] active:bg-neutral-100'

export function DrawerLink({
  to,
  icon,
  end,
  active,
  onGo,
  children,
}: {
  to: string
  icon: IconName
  end?: boolean
  /** 不想用網址前綴判斷時（例如「我的場次」底下的場次子頁）由呼叫端指定 */
  active?: boolean
  onGo?: () => void
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onGo}
      className={({ isActive }) =>
        `${ITEM} ${
          (active ?? isActive) ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-700'
        }`
      }
    >
      <Icon name={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </NavLink>
  )
}

export function DrawerButton({
  icon,
  onClick,
  danger,
  disabled,
  children,
}: {
  icon: IconName
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${ITEM} disabled:opacity-50 ${danger ? 'text-red-700' : 'text-neutral-700'}`}
    >
      <Icon name={icon} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

/** 推到選單最下面的一組（回顧客頁、登出…） */
export function DrawerFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto border-t border-neutral-200 pt-2">{children}</div>
}
