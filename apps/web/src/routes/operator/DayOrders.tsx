import { useState } from 'react'
import { useParams } from 'react-router-dom'
import type { MarketDayDetail, SubOrderStatus } from '@market/shared'
import { apiFetch } from '@/api/client'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  MoneyTWD,
  PageHeader,
  Spinner,
  formatTaipeiDate,
} from '@/components/common'
import { FormError, StatusBadge } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'

interface OperatorSubOrder {
  id: string
  stall: { id: string; name: string }
  boothNo: string
  pickupCode: string
  status: SubOrderStatus
  subtotal: number
  contactName: string
  contactPhone: string
  pickupAt: string
  itemCount: number
  items: {
    productCode: string
    productName: string
    qty: number
    lineTotal: number
    components: { name: string; customNote: string | null }[]
  }[]
}

interface PrepData {
  stalls: {
    stall: { id: string; name: string }
    products: {
      productCode: string
      productName: string
      prepCount: number
      components: { name: string; prepCount: number }[]
    }[]
  }[]
}

const STATUS_TABS: { value: SubOrderStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '全部' },
  { value: 'PENDING', label: '待取貨' },
  { value: 'PICKED_UP', label: '已取貨' },
  { value: 'NO_SHOW', label: '未取' },
  { value: 'CANCELLED', label: '取消' },
]

/** O6 訂單總覽：篩選、CSV 匯出、全攤商備貨表 */
export default function DayOrders() {
  const { id = '' } = useParams()
  const day = useApi<MarketDayDetail>(`/market-days/${id}`)
  const [status, setStatus] = useState<SubOrderStatus | 'ALL'>('ALL')
  const [stallId, setStallId] = useState<string>('')
  const [showPrep, setShowPrep] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const query = new URLSearchParams()
  if (status !== 'ALL') query.set('status', status)
  if (stallId) query.set('stallId', stallId)
  const qs = query.toString()

  const orders = useApi<{ items: OperatorSubOrder[] }>(
    `/operator/market-days/${id}/sub-orders${qs ? `?${qs}` : ''}`,
  )
  const prep = useApi<PrepData>(showPrep ? `/operator/market-days/${id}/prep-sheet` : null)

  /**
   * 匯出 CSV。用 fetch 取回再存檔，而不是直接開連結，
   * 這樣才帶得到 session cookie 也才能處理 403。
   */
  const exportCsv = async () => {
    setDownloadError(null)
    try {
      const text = await apiFetch<string>(`/operator/market-days/${id}/export.csv`)
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders-${day.data?.eventDate ?? id}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('匯出失敗，請稍後再試')
    }
  }

  if (day.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={day.reload} />

  const items = orders.data?.items ?? []
  const total = items.reduce((n, o) => n + o.subtotal, 0)

  return (
    <>
      <PageHeader
        title="訂單總覽"
        subtitle={day.data ? formatTaipeiDate(day.data.eventDate) : undefined}
        action={
          <button type="button" className="btn-secondary text-sm" onClick={exportCsv}>
            匯出 CSV
          </button>
        }
      />

      <div className="px-4">
        <FormError message={downloadError} />
      </div>

      <div className="space-y-2 px-4 pb-3">
        <div className="flex gap-1 overflow-x-auto text-sm">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setStatus(t.value)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
                status === t.value
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-neutral-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={stallId}
          onChange={(e) => setStallId(e.target.value)}
        >
          <option value="">全部攤商</option>
          {day.data?.participations.map((p) => (
            <option key={p.stall.id} value={p.stall.id}>
              {p.stall.name}（{p.boothNo}）
            </option>
          ))}
        </select>

        <button
          type="button"
          className="btn-secondary w-full text-sm"
          onClick={() => setShowPrep((v) => !v)}
        >
          {showPrep ? '收起備貨總表' : '備貨總表（全部攤商）'}
        </button>
      </div>

      {showPrep ? (
        <section className="mx-4 mb-4">
          {prep.loading ? <Spinner /> : null}
          {prep.data?.stalls.map((s) => (
            <div key={s.stall.id} className="card mb-3 overflow-hidden">
              <h3 className="border-b border-neutral-200 px-4 py-2 text-sm font-semibold">
                {s.stall.name}
              </h3>
              <ul className="divide-y divide-neutral-100">
                {s.products.map((p) => (
                  <li key={p.productCode} className="px-4 py-2">
                    <div className="flex justify-between text-sm">
                      <span>{p.productName}</span>
                      <span className="font-bold tabular-nums">{p.prepCount}</span>
                    </div>
                    {p.components.map((c) => (
                      <div
                        key={c.name}
                        className="flex justify-between pl-4 text-xs text-neutral-600"
                      >
                        <span>・{c.name}</span>
                        <span className="tabular-nums">{c.prepCount}</span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {orders.loading ? <Spinner /> : null}
      {orders.error ? <ErrorState message={orders.error} onRetry={orders.reload} /> : null}
      {orders.data && items.length === 0 ? <EmptyState title="沒有符合的訂單" /> : null}

      {items.length > 0 ? (
        <>
          <p className="px-4 pb-2 text-sm text-neutral-600">
            {items.length} 筆子單・合計 <MoneyTWD value={total} />
          </p>
          <ul className="space-y-2 px-4 pb-8">
            {items.map((o) => (
              <li key={o.id} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="font-mono text-lg font-bold tracking-wider">
                        {o.pickupCode}
                      </span>
                      <span className="truncate text-sm text-neutral-700">{o.stall.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{o.boothNo}</span>
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">
                      {o.contactName}・{o.contactPhone}・取貨{' '}
                      <span className="tabular-nums">{o.pickupAt}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-neutral-500">
                      {o.items.map((i) => `${i.productName}×${i.qty}`).join('、')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <StatusBadge status={o.status} label={subOrderStatusLabel[o.status]} />
                    <p className="mt-1 text-sm font-semibold">
                      <MoneyTWD value={o.subtotal} />
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  )
}
