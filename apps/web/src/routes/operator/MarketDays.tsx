import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MarketDayStatus } from '@market/shared'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDate,
  formatTaipeiDateTime,
} from '@/components/common'
import { Field, FormError, StatusBadge, inputClass } from '@/components/form'
import { addDays, taipeiLocalToUtcIso, todayInTaipei } from '@/lib/datetime'
import { marketDayStatusLabel } from '@/i18n/zh-TW'

interface OperatorDay {
  id: string
  market: { id: string; code: string; name: string }
  eventDate: string
  openTime: string
  closeTime: string
  orderDeadline: string
  status: MarketDayStatus
  stallCount: number
  preorderCount: number
}

interface MarketItem {
  id: string
  code: string
  name: string
}

const TABS: { value: MarketDayStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'DRAFT', label: '未發布' },
  { value: 'PUBLISHED', label: '已發布' },
  { value: 'CLOSED', label: '已結案' },
]

/** O3 場次列表：狀態 tab + 新增場次 */
export default function MarketDays() {
  const [tab, setTab] = useState<MarketDayStatus | 'ALL'>('ALL')
  const query = tab === 'ALL' ? '' : `?status=${tab}`
  const { data, loading, error, reload } = useApi<{ items: OperatorDay[] }>(
    `/operator/market-days${query}`,
  )
  const markets = useApi<{ items: MarketItem[] }>('/operator/markets')

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const defaultDate = addDays(todayInTaipei(), 1)
  const [form, setForm] = useState({
    marketId: '',
    eventDate: defaultDate,
    openTime: '09:00',
    closeTime: '15:00',
    deadlineLocal: `${todayInTaipei()}T22:00`,
    locationNote: '',
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/operator/market-days', {
        marketId: form.marketId || markets.data?.items[0]?.id,
        eventDate: form.eventDate,
        openTime: form.openTime,
        closeTime: form.closeTime,
        orderDeadline: taipeiLocalToUtcIso(form.deadlineLocal),
        ...(form.locationNote ? { locationNote: form.locationNote } : {}),
      })
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const hasMarkets = (markets.data?.items.length ?? 0) > 0

  return (
    <>
      <PageHeader
        title="場次"
        action={
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => setOpen((v) => !v)}
            disabled={!hasMarkets}
          >
            {open ? '取消' : '新增場次'}
          </button>
        }
      />

      {!hasMarkets && !markets.loading ? (
        <p className="mx-4 mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          請先到「市集」建立一個市集。
        </p>
      ) : null}

      {open ? (
        <form onSubmit={submit} className="card mx-4 mb-4 space-y-3 p-4">
          <FormError message={formError} />
          <Field label="市集" required>
            <select
              className={inputClass}
              value={form.marketId || markets.data?.items[0]?.id || ''}
              onChange={(e) => setForm({ ...form, marketId: e.target.value })}
            >
              {markets.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}｜{m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="日期" required>
            <input
              type="date"
              className={inputClass}
              value={form.eventDate}
              onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="開始營業" required>
              <input
                type="time"
                step={900}
                className={inputClass}
                value={form.openTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                required
              />
            </Field>
            <Field label="結束營業" required>
              <input
                type="time"
                step={900}
                className={inputClass}
                value={form.closeTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label="預購截止" required hint="台北時間；超過這個時刻顧客不能再下單">
            <input
              type="datetime-local"
              className={inputClass}
              value={form.deadlineLocal}
              onChange={(e) => setForm({ ...form, deadlineLocal: e.target.value })}
              required
            />
          </Field>
          <Field label="地點備註">
            <input
              className={inputClass}
              value={form.locationNote}
              onChange={(e) => setForm({ ...form, locationNote: e.target.value })}
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? '建立中…' : '建立場次（未發布）'}
          </button>
        </form>
      ) : null}

      <div className="mb-3 flex gap-1 overflow-x-auto px-4 text-sm">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
              tab === t.value ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? <EmptyState title="沒有符合的場次" /> : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4">
          {data.items.map((d) => (
            <li key={d.id}>
              <Link to={`/operator/days/${d.id}`} className="card block p-4 active:bg-neutral-50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold">{formatTaipeiDate(d.eventDate)}</p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {d.market.code}｜{d.market.name}
                    </p>
                  </div>
                  <StatusBadge status={d.status} label={marketDayStatusLabel[d.status]} />
                </div>
                <p className="mt-2 text-sm text-neutral-600 tabular-nums">
                  {d.openTime}–{d.closeTime}{'  '}截止 {formatTaipeiDateTime(d.orderDeadline)}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {d.stallCount} 攤商・{d.preorderCount} 筆訂單
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
