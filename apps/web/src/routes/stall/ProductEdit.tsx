import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner } from '@/components/common'
import { Field, FormError, Toast, inputClass } from '@/components/form'
import ImageUploader from '@/components/ImageUploader'

interface ComponentRow {
  id?: string
  name: string
  extraPrice: number
  allowCustomNote: boolean
}

interface ProductDetail {
  id: string
  code: string
  name: string
  description: string | null
  imageUrl: string | null
  thumbUrl: string | null
  basePrice: number
  isActive: boolean
  components: ComponentRow[]
}

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  basePrice: 0,
}

/** S4 商品編輯（`new` 為新增） */
export default function ProductEdit() {
  const { stallId = '', id = 'new' } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const existing = useApi<{ items: ProductDetail[] }>(
    isNew ? null : `/stalls/${stallId}/products?includeInactive=true`,
  )

  const [form, setForm] = useState(EMPTY_FORM)
  const [components, setComponents] = useState<ComponentRow[]>([])
  const [image, setImage] = useState<{ imageUrl: string | null; thumbUrl: string | null }>({
    imageUrl: null,
    thumbUrl: null,
  })
  const [productId, setProductId] = useState<string | null>(isNew ? null : id)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (isNew || !existing.data) return
    const p = existing.data.items.find((x) => x.id === id)
    if (!p) return
    setForm({
      code: p.code,
      name: p.name,
      description: p.description ?? '',
      basePrice: p.basePrice,
    })
    setComponents(p.components)
    setImage({ imageUrl: p.imageUrl, thumbUrl: p.thumbUrl })
    setProductId(p.id)
  }, [existing.data, id, isNew])

  const showToast = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 1800)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        basePrice: Number(form.basePrice),
      }

      let targetId = productId
      if (isNew && !targetId) {
        const created = await api.post<ProductDetail>(
          `/stalls/${stallId}/products`,
          { ...payload, components },
        )
        targetId = created.id
        setProductId(created.id)
      } else {
        await api.patch(`/stalls/${stallId}/products/${targetId}`, payload)
        await api.put(
          `/stalls/${stallId}/products/${targetId}/components`,
          components.map((c, i) => ({ ...c, sortOrder: i + 1 })),
        )
      }

      showToast('已儲存')
      navigate(`/stall/${stallId}/products`)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!productId) return
    if (!window.confirm('停用後這個商品不會出現在新的上架清單，已成立的訂單不受影響。確定嗎？')) {
      return
    }
    try {
      await api.delete(`/stalls/${stallId}/products/${productId}`)
      navigate(`/stall/${stallId}/products`)
    } catch (err) {
      setError(toMessage(err))
    }
  }

  if (!isNew && existing.loading) return <Spinner />
  if (!isNew && existing.error) {
    return <ErrorState message={existing.error} onRetry={existing.reload} />
  }

  const setComponent = (i: number, patch: Partial<ComponentRow>) =>
    setComponents((list) => list.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const move = (i: number, delta: number) =>
    setComponents((list) => {
      const next = [...list]
      const target = i + delta
      if (target < 0 || target >= next.length) return list
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })

  return (
    <>
      <PageHeader title={isNew ? '新增商品' : '編輯商品'} />

      <form onSubmit={save} className="space-y-4 px-4 pb-10">
        <FormError message={error} />

        {productId ? (
          <div className="card p-4">
            <p className="mb-2 text-sm font-medium text-neutral-700">商品圖片</p>
            <ImageUploader
              endpoint={`/stalls/${stallId}/products/${productId}/image`}
              imageUrl={image.imageUrl}
              thumbUrl={image.thumbUrl}
              onUploaded={(r) => {
                setImage(r)
                showToast('圖片已更新')
              }}
            />
          </div>
        ) : (
          <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600">
            先儲存商品，才能上傳圖片。
          </p>
        )}

        <div className="card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="商品代碼" required hint="攤商內唯一">
              <input
                className={`${inputClass} font-mono`}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                maxLength={16}
                required
              />
            </Field>
            <Field label="基本價" required hint="整數元">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className={inputClass}
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })}
                required
              />
            </Field>
          </div>
          <Field label="商品名稱" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <p className="text-sm font-medium text-neutral-700">內容物</p>
              <p className="text-xs text-neutral-500">顧客可複選的加購項，每項可設加價</p>
            </div>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() =>
                setComponents((l) => [...l, { name: '', extraPrice: 0, allowCustomNote: true }])
              }
            >
              新增一列
            </button>
          </div>

          {components.length === 0 ? (
            <p className="py-3 text-sm text-neutral-400">沒有內容物</p>
          ) : (
            <ul className="space-y-3">
              {components.map((c, i) => (
                <li key={c.id ?? `new-${i}`} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex gap-2">
                    <input
                      className={inputClass}
                      placeholder="品項名稱"
                      value={c.name}
                      onChange={(e) => setComponent(i, { name: e.target.value })}
                      required
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={`${inputClass} w-24 shrink-0`}
                      placeholder="加價"
                      value={c.extraPrice}
                      onChange={(e) => setComponent(i, { extraPrice: Number(e.target.value) })}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-neutral-600">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={c.allowCustomNote}
                        onChange={(e) => setComponent(i, { allowCustomNote: e.target.checked })}
                      />
                      允許特製備註
                    </label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                        onClick={() => move(i, -1)}
                        aria-label="上移"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
                        onClick={() => move(i, 1)}
                        aria-label="下移"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600"
                        onClick={() => setComponents((l) => l.filter((_, idx) => idx !== i))}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '儲存中…' : '儲存'}
        </button>

        {!isNew ? (
          <button type="button" className="btn-secondary w-full text-red-600" onClick={remove}>
            停用這個商品
          </button>
        ) : null}
      </form>

      <Toast message={toast} />
    </>
  )
}
