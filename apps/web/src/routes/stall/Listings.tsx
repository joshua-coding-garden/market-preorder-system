import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { ListingStatus } from '@market/shared'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, MoneyTWD, PageHeader, Spinner } from '@/components/common'
import { FormError, Toast, inputClass } from '@/components/form'

interface ProductRow {
  id: string
  code: string
  name: string
  thumbUrl: string | null
  basePrice: number
}

interface ListingRow {
  productId: string
  price: number
  maxQty: number | null
  status: ListingStatus
  /** ⚠️ 規格外（2026-09-20）：上架審核 */
  approval?: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED'
  rejectReason?: string | null
}

interface StallDay {
  participationId: string
  boothNo: string
  marketDay: { id: string; eventDate: string; status: string }
}

interface Draft {
  listed: boolean
  price: number
  maxQty: string
  status: ListingStatus
}

/** S5 本場上架 */
export default function Listings() {
  const { stallId = '', dayId = '' } = useParams()
  const products = useApi<{ items: ProductRow[] }>(`/stalls/${stallId}/products`)
  const listings = useApi<{ items: ListingRow[] }>(
    `/stalls/${stallId}/market-days/${dayId}/listings`,
  )
  const days = useApi<{ items: StallDay[] }>(`/stalls/${stallId}/market-days`)

  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!products.data || !listings.data) return
    const byProduct = new Map(listings.data.items.map((l) => [l.productId, l]))
    const next: Record<string, Draft> = {}
    for (const p of products.data.items) {
      const l = byProduct.get(p.id)
      next[p.id] = {
        listed: Boolean(l) && l?.status !== 'OFF_SHELF',
        price: l?.price ?? p.basePrice,
        maxQty: l?.maxQty != null ? String(l.maxQty) : '',
        status: l && l.status !== 'OFF_SHELF' ? l.status : 'ON_SALE',
      }
    }
    setDraft(next)
  }, [products.data, listings.data])

  const showToast = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 1800)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const payload = Object.entries(draft)
        .filter(([, d]) => d.listed)
        .map(([productId, d]) => ({
          productId,
          price: Number(d.price),
          maxQty: d.maxQty === '' ? null : Number(d.maxQty),
          status: d.status,
        }))
      await api.put(`/stalls/${stallId}/market-days/${dayId}/listings`, payload)
      showToast('已儲存上架設定')
      listings.reload()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const copyFrom = async () => {
    const previous = days.data?.items
      .filter((d) => d.marketDay.id !== dayId)
      .sort((a, b) => b.marketDay.eventDate.localeCompare(a.marketDay.eventDate))[0]
    if (!previous) {
      setError('沒有更早的場次可以沿用')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await api.post<{ copied: number; skipped: number }>(
        `/stalls/${stallId}/market-days/${dayId}/listings/copy-from`,
        { sourceDayId: previous.marketDay.id },
      )
      showToast(`已沿用 ${previous.marketDay.eventDate}：新增 ${res.copied}、跳過 ${res.skipped}`)
      listings.reload()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (products.loading || listings.loading) return <Spinner />
  if (products.error) return <ErrorState message={products.error} onRetry={products.reload} />

  const rows = products.data?.items ?? []
  const thisDay = days.data?.items.find((d) => d.marketDay.id === dayId)
  const isClosed = thisDay?.marketDay.status === 'CLOSED'

  return (
    <>
      <PageHeader
        title="本場上架"
        subtitle={thisDay ? `${thisDay.marketDay.eventDate}・攤位 ${thisDay.boothNo}` : undefined}
        action={
          !isClosed ? (
            <button type="button" className="btn-secondary text-sm" onClick={copyFrom}>
              沿用上一場
            </button>
          ) : null
        }
      />

      <div className="px-4">
        <FormError message={error} />
        {isClosed ? (
          <p className="mb-3 rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
            這個場次已結案，上架設定為唯讀。
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="px-4 text-sm text-neutral-500">還沒有商品，請先到「商品管理」建立。</p>
      ) : (
        <ul className="space-y-3 px-4 pb-28">
          {rows.map((p) => {
            const d = draft[p.id]
            if (!d) return null
            return (
              <li key={p.id} className="card p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0"
                    checked={d.listed}
                    disabled={isClosed}
                    onChange={(e) =>
                      setDraft({ ...draft, [p.id]: { ...d, listed: e.target.checked } })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{p.name}</p>
                    <p className="font-mono text-xs text-neutral-500">
                      {p.code}・基本價 <MoneyTWD value={p.basePrice} />
                    </p>
                    {/* ⚠️ 規格外（2026-09-20）：審核開著時，攤商要看得到自己卡在哪 */}
                    {(() => {
                      const l = listings.data?.items.find((x) => x.productId === p.id)
                      if (!l?.approval || l.approval === 'APPROVED') return null
                      return l.approval === 'PENDING_REVIEW' ? (
                        <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          待主辦單位審核，顧客還看不到
                        </p>
                      ) : (
                        <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-[11px] leading-relaxed text-red-700">
                          已被退回：{l.rejectReason ?? '未附理由'}（修改後儲存會重新送審）
                        </p>
                      )
                    })()}
                  </div>
                </label>

                {d.listed ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 pl-8">
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">本場售價</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className={inputClass}
                        value={d.price}
                        disabled={isClosed}
                        onChange={(e) =>
                          setDraft({ ...draft, [p.id]: { ...d, price: Number(e.target.value) } })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">預購上限</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        placeholder="不限"
                        className={inputClass}
                        value={d.maxQty}
                        disabled={isClosed}
                        onChange={(e) =>
                          setDraft({ ...draft, [p.id]: { ...d, maxQty: e.target.value } })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-500">狀態</span>
                      <select
                        className={inputClass}
                        value={d.status}
                        disabled={isClosed}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            [p.id]: { ...d, status: e.target.value as ListingStatus },
                          })
                        }
                      >
                        <option value="ON_SALE">販售中</option>
                        <option value="SOLD_OUT">已售完</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {!isClosed && rows.length > 0 ? (
        <div className="fixed bottom-0 left-1/2 w-full max-w-screen-sm -translate-x-1/2 border-t border-neutral-200 bg-white p-3">
          <button type="button" className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? '儲存中…' : '儲存上架設定'}
          </button>
        </div>
      ) : null}

      <Toast message={toast} />
    </>
  )
}
