import { Link, useParams } from 'react-router-dom'
import type { OrderDetail as Order } from '@/api/cartTypes'
import { useApi } from '@/api/useApi'
import {
  ErrorState,
  MoneyTWD,
  PickupCode,
  Spinner,
  formatTaipeiDate,
} from '@/components/common'
import { StatusBadge } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'

/** C7 訂單完成／明細：每攤一張卡，取貨碼大字 */
export default function OrderDetail() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useApi<Order>(`/orders/${id}`)

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  return (
    <div className="pb-10">
      <section className="bg-white px-4 pb-4 pt-6 text-center">
        <p className="text-lg font-bold text-green-700">預購完成</p>
        <p className="mt-2 text-base font-semibold">{formatTaipeiDate(data.marketDay.eventDate)}</p>
        <p className="mt-0.5 text-sm text-neutral-600">
          {data.marketDay.marketName}・{data.marketDay.location}
        </p>
        {data.marketDay.locationNote ? (
          <p className="text-sm text-neutral-500">{data.marketDay.locationNote}</p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-700">
          取貨時間 <span className="font-semibold tabular-nums">{data.pickupAt}</span>
        </p>
      </section>

      <p className="mx-4 mt-2 rounded-xl bg-brand-50 px-3 py-2.5 text-center text-sm text-brand-800">
        請到各攤位出示取貨碼付款取貨
      </p>

      <div className="mt-4 space-y-4 px-4">
        {data.subOrders.map((so) => (
          <section key={so.id} className="card overflow-hidden">
            <header className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{so.stall.name}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">攤位 {so.boothNo}</p>
              </div>
              <StatusBadge status={so.status} label={subOrderStatusLabel[so.status]} />
            </header>

            <div className="flex flex-col items-center gap-1.5 border-b border-neutral-100 py-4">
              <span className="text-xs text-neutral-500">取貨碼</span>
              <PickupCode code={so.pickupCode} />
            </div>

            <ul className="divide-y divide-neutral-100">
              {so.items.map((item, i) => (
                <li key={`${so.id}-${i}`} className="px-4 py-2.5">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 flex-1">
                      {item.productName}
                      <span className="ml-1.5 text-neutral-500">×{item.qty}</span>
                    </span>
                    <MoneyTWD value={item.lineTotal} />
                  </div>
                  {item.components.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {item.components.map((c, j) => (
                        <li key={j} className="text-xs text-neutral-500">
                          ・{c.name}
                          {c.extraPrice > 0 ? ` +${c.extraPrice}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.customNote ? (
                    <p className="mt-1 rounded bg-amber-50 px-1.5 py-1 text-xs text-amber-900">
                      備註：{item.customNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <footer className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-neutral-600">小計</span>
              <span className="font-semibold">
                <MoneyTWD value={so.subtotal} />
              </span>
            </footer>
          </section>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between px-4">
        <span className="text-sm text-neutral-600">總計</span>
        <span className="text-2xl font-bold">
          <MoneyTWD value={data.totalAmount} />
        </span>
      </div>

      <dl className="mt-4 space-y-1 px-4 text-sm text-neutral-600">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-neutral-400">取貨人</dt>
          <dd>{data.contactName}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-neutral-400">電話</dt>
          <dd className="tabular-nums">{data.contactPhone}</dd>
        </div>
        {data.note ? (
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-neutral-400">備註</dt>
            <dd>{data.note}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-6 space-y-2 px-4">
        <Link to="/orders" className="btn-secondary w-full">
          我的訂單
        </Link>
        <Link to="/" className="btn-secondary w-full">
          回首頁
        </Link>
      </div>
    </div>
  )
}
