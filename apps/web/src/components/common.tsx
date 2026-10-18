import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AuthMenu from './AuthMenu'
import { Icon } from './icons'
import { MenuButton, useShell } from './Shell'

/** MoneyTWD：NT$ 1,234（05 §共用元件） */
export function MoneyTWD({ value }: { value: number }) {
  return <span className="tabular-nums">NT$ {value.toLocaleString('zh-TW')}</span>
}

/** TaipeiDateTime：統一時區格式（02 §E：一律 Asia/Taipei） */
export function formatTaipeiDate(isoDate: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(`${isoDate}T00:00:00+08:00`))
}

export function formatTaipeiDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** 預購截止倒數（C1） */
export function deadlineCountdown(deadlineIso: string, now: Date = new Date()): string {
  const diffMs = new Date(deadlineIso).getTime() - now.getTime()
  if (diffMs <= 0) return '預購已截止'
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours >= 24) return `還有 ${Math.floor(hours / 24)} 天可預購`
  if (hours >= 1) return `還有 ${hours} 小時可預購`
  return `還有 ${Math.max(1, Math.floor(diffMs / 60_000))} 分鐘可預購`
}

export function Spinner({ label = '載入中…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-neutral-500">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-brand-500" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <p className="text-base font-medium text-neutral-700">{title}</p>
      {hint ? <p className="text-sm text-neutral-500">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-base font-medium text-red-600">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          重試
        </button>
      ) : null}
    </div>
  )
}

export interface BackTarget {
  to: string
  label: string
}

/**
 * ⚠️ 規格外（2026-10-18 指示）：回上一層（‹ 標籤）。
 *
 * 一律連到固定的上一層，不用 history.back()：LINE 通知會直接開在中間層
 * （例 /stall/:id/days/:dayId/orders、/orders/:id），那時候 back 會直接離開 LIFF。
 */
export function BackLink({ to, label }: BackTarget) {
  return (
    <Link
      to={to}
      className="-ml-1.5 inline-flex min-h-11 max-w-full items-center gap-0.5 rounded-lg px-1.5 text-sm text-neutral-600 active:bg-neutral-100"
    >
      <Icon name="back" size={18} strokeWidth={2.2} />
      <span className="truncate">{label}</span>
    </Link>
  )
}

/**
 * 頁首：攤商專區與市集後台是「☰＋大字頁名＋帳號」（☰ 由 layout 透過 ShellContext 提供），
 * 顧客 View 沒有 ShellContext，只畫頁名。第二層頁面傳 back 會多一行返回鍵。
 */
export function PageHeader({
  title,
  subtitle,
  action,
  back,
  nav,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  back?: BackTarget
  /** 返回鍵下面的頁籤，例如攤商場次子頁的上架／訂單／備貨／核銷 */
  nav?: ReactNode
}) {
  const shell = useShell()
  // 說明列預設跟頁名對齊（放在 ☰ 右邊那一欄）；有返回鍵或頁籤時改放到它們下面
  const subBelow = !!nav || (!!shell && !!back)
  const sub =
    subtitle || action ? (
      <div className="mt-1 flex items-start justify-between gap-3">
        {subtitle ? <p className="min-w-0 text-sm text-neutral-500">{subtitle}</p> : <span />}
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    ) : null

  return (
    <header className={`px-4 pb-3 ${shell || back ? 'pt-3' : 'pt-5'}`}>
      {/* 顧客 View 沒有 ☰ 那一列，返回鍵放標題上面；後台放在 ☰ 那一列下面 */}
      {back && !shell ? <BackLink {...back} /> : null}
      <div className="flex items-start gap-3">
        {shell ? (
          <MenuButton onClick={shell.openMenu} className={shell.menuButtonClassName} />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-3 ${shell ? 'min-h-11' : ''}`}>
            <h1 className="min-w-0 flex-1 truncate text-[22px] font-bold leading-tight text-neutral-900">
              {title}
            </h1>
            {shell ? <AuthMenu variant="avatar" /> : null}
          </div>
          {subBelow ? null : sub}
        </div>
      </div>
      {back && shell ? <BackLink {...back} /> : null}
      {nav}
      {subBelow ? <div className={nav ? 'mt-1' : ''}>{sub}</div> : null}
    </header>
  )
}

/** PickupCode（05 §共用元件）：4 碼大字等寬顯示，可點複製 */
export function PickupCode({ code, size = 'lg' }: { code: string; size?: 'lg' | 'md' }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 沒有剪貼簿權限時就讓使用者自己選取，不必報錯
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-xl bg-neutral-900 px-4 font-mono font-bold tracking-[0.12em] text-white ${
        size === 'lg' ? 'py-3 text-3xl' : 'py-2 text-xl'
      }`}
      aria-label={`取貨碼 ${code}，點擊複製`}
    >
      {copied ? '已複製' : code}
    </button>
  )
}
