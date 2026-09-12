import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDateTime,
} from '@/components/common'
import { Field, FormError, StatusBadge, Toast, inputClass } from '@/components/form'
import { broadcastStatusLabel } from '@/i18n/zh-TW'
import { useSession } from '@/store/session'

interface BroadcastRow {
  id: string
  composeMode: string
  title: string
  bodyText: string
  audience: string
  status: string
  rejectReason: string | null
  sentAt: string | null
  recipientCount: number | null
  createdAt: string
  marketDay: { id: string; eventDate: string } | null
}

interface StallDay {
  boothNo: string
  marketDay: { id: string; eventDate: string; status: string }
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL_FRIENDS: '官方帳號所有好友',
  MARKET_DAY_CUSTOMERS: '該場次所有下單顧客',
  STALL_CUSTOMERS: '該場次向本攤下單的顧客',
}

/** S10 推播申請 */
export default function Broadcasts() {
  const { stallId = '' } = useParams()
  const { me } = useSession()
  const list = useApi<{ items: BroadcastRow[] }>(`/stalls/${stallId}/broadcasts`)
  const days = useApi<{ items: StallDay[] }>(`/stalls/${stallId}/market-days`)

  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [form, setForm] = useState({
    composeMode: 'STALL_COMPOSE' as 'STALL_COMPOSE' | 'OPERATOR_COMPOSE',
    title: '',
    bodyText: '',
    audience: 'STALL_CUSTOMERS',
    marketDayId: '',
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post(`/stalls/${stallId}/broadcasts`, {
        composeMode: form.composeMode,
        ...(form.title ? { title: form.title } : {}),
        ...(form.bodyText ? { bodyText: form.bodyText } : {}),
        audience: form.audience,
        ...(form.marketDayId ? { marketDayId: form.marketDayId } : {}),
      })
      setToast(
        form.composeMode === 'STALL_COMPOSE' ? '已送出審核' : '已建立，等待廠商代寫',
      )
      setTimeout(() => setToast(null), 2200)
      setForm({ ...form, title: '', bodyText: '' })
      setOpen(false)
      list.reload()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const stallName = me?.stalls.find((s) => s.id === stallId)?.name

  return (
    <>
      <PageHeader
        title="推播申請"
        subtitle={stallName}
        action={
          <button type="button" className="btn-primary text-sm" onClick={() => setOpen((v) => !v)}>
            {open ? '取消' : '新申請'}
          </button>
        }
      />

      {open ? (
        <form onSubmit={submit} className="card mx-4 mb-4 space-y-3 p-4">
          <FormError message={error} />

          <Field label="申請方式" required>
            <div className="space-y-2">
              {[
                { value: 'STALL_COMPOSE', label: '自己寫文案，送廠商審核' },
                { value: 'OPERATOR_COMPOSE', label: '請廠商代寫' },
              ].map((o) => (
                <label
                  key={o.value}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    form.composeMode === o.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-neutral-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="composeMode"
                    className="h-4 w-4"
                    checked={form.composeMode === o.value}
                    onChange={() =>
                      setForm({
                        ...form,
                        composeMode: o.value as 'STALL_COMPOSE' | 'OPERATOR_COMPOSE',
                      })
                    }
                  />
                  <span className="text-sm">{o.label}</span>
                </label>
              ))}
            </div>
          </Field>

          {form.composeMode === 'STALL_COMPOSE' ? (
            <>
              <Field label="標題" required>
                <input
                  className={inputClass}
                  value={form.title}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </Field>
              <Field label="內容" required hint="會原樣送給顧客，請先確認文字">
                <textarea
                  className={inputClass}
                  rows={4}
                  maxLength={500}
                  value={form.bodyText}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  required
                />
              </Field>
            </>
          ) : (
            <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
              廠商會幫您撰寫文案。送出後狀態是「草稿」，等廠商填好內容並核准才會發送。
            </p>
          )}

          <Field label="關聯場次">
            <select
              className={inputClass}
              value={form.marketDayId}
              onChange={(e) => setForm({ ...form, marketDayId: e.target.value })}
            >
              <option value="">不指定</option>
              {days.data?.items.map((d) => (
                <option key={d.marketDay.id} value={d.marketDay.id}>
                  {d.marketDay.eventDate}
                </option>
              ))}
            </select>
          </Field>

          <Field label="發送對象" hint="實際對象由廠商核准時決定">
            <select
              className={inputClass}
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            >
              <option value="STALL_CUSTOMERS">{AUDIENCE_LABEL.STALL_CUSTOMERS}</option>
              <option value="MARKET_DAY_CUSTOMERS">
                {AUDIENCE_LABEL.MARKET_DAY_CUSTOMERS}
              </option>
              <option value="ALL_FRIENDS">{AUDIENCE_LABEL.ALL_FRIENDS}</option>
            </select>
          </Field>

          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? '送出中…' : '送出申請'}
          </button>
        </form>
      ) : null}

      {list.loading ? <Spinner /> : null}
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.items.length === 0 ? (
        <EmptyState title="還沒有推播申請" hint="推播會由主辦單位審核後發送" />
      ) : null}

      {list.data && list.data.items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {list.data.items.map((b) => (
            <li key={b.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {b.title || '（由廠商代寫）'}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {formatTaipeiDateTime(b.createdAt)}
                    {b.marketDay ? `・${b.marketDay.eventDate}` : ''}
                  </p>
                </div>
                <StatusBadge
                  status={b.status}
                  label={broadcastStatusLabel[b.status] ?? b.status}
                />
              </div>

              {b.bodyText ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{b.bodyText}</p>
              ) : null}

              <p className="mt-2 text-xs text-neutral-500">
                對象：{AUDIENCE_LABEL[b.audience] ?? b.audience}
              </p>

              {b.status === 'REJECTED' && b.rejectReason ? (
                <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  退回原因：{b.rejectReason}
                </p>
              ) : null}

              {b.status === 'SENT' ? (
                <p className="mt-2 text-xs text-green-700">
                  已於 {b.sentAt ? formatTaipeiDateTime(b.sentAt) : ''} 送出給{' '}
                  {b.recipientCount ?? 0} 人
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Toast message={toast} />
    </>
  )
}
