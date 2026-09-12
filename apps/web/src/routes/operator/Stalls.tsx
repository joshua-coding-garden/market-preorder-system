import { useState } from 'react'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'

interface StallRow {
  id: string
  name: string
  description: string | null
  contactName: string | null
  contactPhone: string | null
  isActive: boolean
  memberCount: number
  members: { id: string; displayName: string }[]
}

const EMPTY = { name: '', description: '', contactName: '', contactPhone: '' }

/** O5 攤商管理：列表 + 新增／編輯 */
export default function Stalls() {
  const { data, loading, error, reload } = useApi<{ items: StallRow[] }>('/operator/stalls')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await api.post('/operator/stalls', {
        name: form.name,
        ...(form.description ? { description: form.description } : {}),
        ...(form.contactName ? { contactName: form.contactName } : {}),
        ...(form.contactPhone ? { contactPhone: form.contactPhone } : {}),
      })
      setForm(EMPTY)
      setOpen(false)
      reload()
    } catch (err) {
      setFormError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (stall: StallRow) => {
    try {
      await api.patch(`/operator/stalls/${stall.id}`, { isActive: !stall.isActive })
      reload()
    } catch (err) {
      setFormError(toMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="攤商"
        subtitle="攤商只能透過邀請碼綁定，不能自助註冊"
        action={
          <button type="button" className="btn-primary text-sm" onClick={() => setOpen((v) => !v)}>
            {open ? '取消' : '新增攤商'}
          </button>
        }
      />

      {open ? (
        <form onSubmit={submit} className="card mx-4 mb-4 space-y-3 p-4">
          <FormError message={formError} />
          <Field label="攤商名稱" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="簡介">
            <textarea
              className={inputClass}
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="聯絡人">
              <input
                className={inputClass}
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </Field>
            <Field label="聯絡電話" hint="09 開頭 10 碼">
              <input
                className={inputClass}
                inputMode="numeric"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            {saving ? '儲存中…' : '建立攤商'}
          </button>
        </form>
      ) : null}

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="還沒有攤商" hint="建立攤商後，到場次頁把他們加入並發邀請碼" />
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {data.items.map((s) => (
            <li key={s.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold">{s.name}</p>
                  {s.description ? (
                    <p className="mt-0.5 text-sm text-neutral-500">{s.description}</p>
                  ) : null}
                  {s.contactName || s.contactPhone ? (
                    <p className="mt-1 text-sm text-neutral-600">
                      {s.contactName}
                      {s.contactPhone ? `・${s.contactPhone}` : ''}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-neutral-400">
                    {s.memberCount === 0
                      ? '尚未有人綁定'
                      : `成員：${s.members.map((m) => m.displayName).join('、')}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleActive(s)}
                  className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs ${
                    s.isActive
                      ? 'border-neutral-300 text-neutral-600'
                      : 'border-amber-300 bg-amber-50 text-amber-700'
                  }`}
                >
                  {s.isActive ? '啟用中' : '已停用'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
