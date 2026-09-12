import type { ReactNode } from 'react'

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500'

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      {message}
    </p>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900/90 px-5 py-2.5 text-sm text-white shadow-lg">
      {message}
    </div>
  )
}

/** 狀態色票（05 §共用元件 StatusBadge） */
const BADGE_STYLES: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-600',
  PUBLISHED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-neutral-200 text-neutral-500',
  ACTIVE: 'bg-blue-100 text-blue-700',
  REDEEMED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-neutral-100 text-neutral-500',
  RECYCLED: 'bg-neutral-100 text-neutral-400',
  PENDING: 'bg-blue-100 text-blue-700',
  PICKED_UP: 'bg-green-100 text-green-700',
  NO_SHOW: 'bg-neutral-200 text-neutral-500',
  CANCELLED: 'bg-red-100 text-red-700',
  ON_SALE: 'bg-green-100 text-green-700',
  SOLD_OUT: 'bg-amber-100 text-amber-700',
  OFF_SHELF: 'bg-neutral-100 text-neutral-500',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  SENT: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        BADGE_STYLES[status] ?? 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {label}
    </span>
  )
}
