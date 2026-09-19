import { useState } from 'react'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'

interface MarketItem {
  id: string
  code: string
  name: string
  location: string
  description: string | null
  isActive: boolean
  marketDayCount: number
}

/** O2 市集：列表 + 新增 */
export default function Markets() {
  const { data, loading, error, reload } = useApi<{ items: MarketItem[] }>(
    '/operator/markets',
  )
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', location: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // ⚠️ 規格外（2026-09-20 指示）：停用／恢復市集
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const toggleActive = async (m: MarketItem): Promise<void> => {
    const next = !m.isActive
    if (
      next === false &&
      !window.confirm(
        `停用「${m.name}」之後，顧客端會看不到這個市集的所有場次，也不能再開新場次。既有訂單不受影響，隨時可以恢復。確定要停用嗎？`,
      )
    ) {
      return
    }
    setBusyId(m.id)
    setActionError(null)
    try {
      await api.patch(`/operator/markets/${m.id}`, { isActive: next })
      reload()
    } catch (err) {
      setActionError(toMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/operator/markets', {
        code: form.code,
        name: form.name,
        location: form.location,
        ...(form.description ? { description: form.description } : {}),
      })
      setForm({ code: '', name: '', location: '', description: '' })
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="市集"
        subtitle="市集代號是邀請碼的前綴，建立後不建議更動"
        action={
          <button type="button" className="btn-primary text-sm" onClick={() => setOpen((v) => !v)}>
            {open ? '取消' : '新增市集'}
          </button>
        }
      />

      {open ? (
        <form onSubmit={submit} className="card mx-4 mb-4 space-y-3 p-4">
          <FormError message={formError} />
          <Field label="市集代號" required hint="1–4 碼大寫英文或數字，例：A、B2">
            <input
              className={inputClass}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              maxLength={4}
              required
            />
          </Field>
          <Field label="名稱" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="地點" required>
            <input
              className={inputClass}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />
          </Field>
          <Field label="說明">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? '儲存中…' : '建立市集'}
          </button>
        </form>
      ) : null}

      <div className="px-4">
        <FormError message={actionError} />
      </div>

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="還沒有市集" hint="先建立一個市集，才能新增場次" />
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4">
          {data.items.map((m) => (
            <li key={m.id} className={`card p-4 ${m.isActive ? '' : 'opacity-60'}`}>
              <div className="flex items-baseline gap-2">
                <span className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-sm font-bold text-brand-700">
                  {m.code}
                </span>
                <span className="min-w-0 flex-1 truncate text-base font-semibold">{m.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    m.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-neutral-200 text-neutral-600'
                  }`}
                >
                  {m.isActive ? '啟用中' : '已停用'}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">{m.location}</p>
              {m.description ? (
                <p className="mt-1 text-sm text-neutral-500">{m.description}</p>
              ) : null}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-neutral-400">{m.marketDayCount} 個場次</p>
                <button
                  type="button"
                  className="rounded-lg border border-neutral-300 px-2.5 py-1 text-xs disabled:opacity-50"
                  disabled={busyId === m.id}
                  onClick={() => void toggleActive(m)}
                >
                  {m.isActive ? '停用' : '恢復'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
