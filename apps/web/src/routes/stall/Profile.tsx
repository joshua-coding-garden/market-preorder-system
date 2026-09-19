import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'
import { useSession } from '@/store/session'

interface StallProfile {
  id: string
  name: string
  description: string | null
  contactName: string | null
  contactPhone: string | null
  logoUrl: string | null
  isActive: boolean
}

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：攤商查看／修改自己的基本資料。
 * 停用與恢復是主辦單位的權限，這裡看得到狀態但改不了。
 */
export default function StallProfilePage() {
  const { stallId = '' } = useParams()
  const { refresh } = useSession()
  const { data, loading, error, reload } = useApi<StallProfile>(`/stalls/${stallId}`)

  const [form, setForm] = useState({
    name: '',
    description: '',
    contactName: '',
    contactPhone: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm({
      name: data.name,
      description: data.description ?? '',
      contactName: data.contactName ?? '',
      contactPhone: data.contactPhone ?? '',
    })
  }, [data])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await api.patch(`/stalls/${stallId}`, {
        name: form.name.trim(),
        // 清空的欄位送空字串，後端會存成空值
        description: form.description.trim(),
        contactName: form.contactName.trim(),
        ...(form.contactPhone.trim() ? { contactPhone: form.contactPhone.trim() } : {}),
      })
      setSaved(true)
      reload()
      // 標題列顯示的攤名可能變了
      await refresh()
    } catch (err) {
      setSaveError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="攤商基本資料" subtitle="顧客在場次頁看到的就是這些資訊" />

      {!data.isActive ? (
        <p className="mx-4 mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
          這個攤商目前被主辦單位停用中，顧客看不到你的商品。請聯絡主辦單位。
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-4 px-4 pb-10">
        <FormError message={saveError} />
        {saved ? (
          <p className="rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700">已儲存</p>
        ) : null}

        <div className="card space-y-3 p-4">
          <Field label="攤商名稱" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              maxLength={50}
              required
            />
          </Field>

          <Field label="介紹" hint="顧客在攤位頁看得到，最多 500 字">
            <textarea
              className={inputClass}
              rows={4}
              maxLength={500}
              placeholder="賣什麼、有什麼特色"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>

        <div className="card space-y-3 p-4">
          <p className="text-sm font-medium text-neutral-700">聯絡方式</p>
          <p className="-mt-1 text-xs text-neutral-500">只有主辦單位看得到，顧客看不到。</p>
          <Field label="聯絡人">
            <input
              className={inputClass}
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              maxLength={50}
            />
          </Field>
          <Field label="聯絡電話" hint="09 開頭 10 碼">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              maxLength={10}
            />
          </Field>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </button>
      </form>
    </>
  )
}
