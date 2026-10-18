import { createContext, useContext } from 'react'
import { Icon } from './icons'

/**
 * ⚠️ 規格外（2026-10-18 指示）：攤商專區與市集後台的頁首改成「☰＋大字頁名＋帳號」。
 *
 * ☰ 畫在每頁的 PageHeader 裡，選單本身由 layout 管，這個 context 把兩邊接起來。
 * 顧客 View 不提供這個 context（它的 ☰ 在 layout 自己的頂端列），PageHeader 就不畫 ☰。
 */
export interface ShellValue {
  openMenu: () => void
  /** 例：後台在桌機有常駐側欄，☰ 只在窄螢幕出現 */
  menuButtonClassName?: string
}

const ShellContext = createContext<ShellValue | null>(null)

export const ShellProvider = ShellContext.Provider

export function useShell(): ShellValue | null {
  return useContext(ShellContext)
}

export function MenuButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="開啟選單"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)] active:bg-neutral-100 ${className}`}
    >
      <Icon name="menu" strokeWidth={2.2} />
    </button>
  )
}
