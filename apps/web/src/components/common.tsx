import { useState, type ReactNode } from 'react'

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

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-5">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      {action}
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
