import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  ErrorState,
  MoneyTWD,
  PageHeader,
  PickupCode,
  Spinner,
  formatTaipeiDateTime,
} from '@/components/common'
import { FormError, StatusBadge, Toast } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'
import type { StallSubOrder } from './SubOrders'

/** S7 訂單詳情 */
export default function SubOrderDetail() {
  const { stallId = '', id = '' } = useParams()
  const { data, loading, error, reload } = useApi<StallSubOrder>(
    `/stalls/${stallId}/sub-orders/${id}`,
  )
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      setToast(ok)
      setTimeout(() => setToast(null), 1800)
      reload()
    } catch (err) {
      setActionError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const isPending = data.status === 'PENDING'
  // ⚠️ 規格外（2026-09-20）：還沒接單的只給「確認接單／婉拒」兩個動作
  const needsConfirm = data.status === 'PENDING_CONFIRM'

  return (
    <>
      <PageHeader
        title="訂單詳情"
        action={<StatusBadge status={data.status} label={subOrderStatusLabel[data.status]} />}
      />

      <div className="flex flex-col items-center gap-2 pb-4">
        <span className="text-xs text-neutral-500">取貨碼</span>
        <PickupCode code={data.pickupCode} />
        {data.pickedUpAt ? (
          <span className="text-xs text-green-700">
            已於 {formatTaipeiDateTime(data.pickedUpAt)} 取貨
          </span>
        ) : null}
      </div>

      <section className="card mx-4 mb-4 p-4 text-sm">
        <dl className="space-y-1.5 text-neutral-700">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-neutral-400">顧客</dt>
            <dd>{data.contactName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-neutral-400">電話</dt>
            <dd>
              <a href={`tel:${data.contactPhone}`} className="text-brand-700 underline">
                {data.contactPhone}
              </a>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-neutral-400">取貨時間</dt>
            <dd className="tabular-nums">{data.pickupAt}</dd>
          </div>
          {data.note ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-neutral-400">備註</dt>
              <dd>{data.note}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="card mx-4 mb-4 overflow-hidden">
        <h2 className="border-b border-neutral-200 px-4 py-2.5 text-base font-semibold">明細</h2>
        <ul className="divide-y divide-neutral-100">
          {data.items.map((item, i) => (
            <li key={i} className="px-4 py-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.productName}
                    <span className="ml-2 font-mono text-xs text-neutral-400">
                      {item.productCode}
                    </span>
                  </p>
                  {item.components.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {item.components.map((c, j) => (
                        <li key={j} className="text-xs text-neutral-600">
                          ・{c.name}
                          {c.extraPrice > 0 ? ` +${c.extraPrice}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.customNote ? (
                    <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                      備註：{item.customNote}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-neutral-500">
                    單價 <MoneyTWD value={item.unitPrice} /> × {item.qty}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  <MoneyTWD value={item.lineTotal} />
                </span>
              </div>
            </li>
          ))}
        </ul>
        <footer className="flex justify-between px-4 py-3 text-sm">
          <span className="text-neutral-600">小計</span>
          <span className="text-lg font-bold">
            <MoneyTWD value={data.subtotal} />
          </span>
        </footer>
      </section>

      <div className="px-4 pb-8">
        <FormError message={actionError} />
        {needsConfirm ? (
          <div className="mt-2 space-y-2">
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              這筆還沒確認。按下「確認接單」之後訂單才算成立，也才會進備貨總表、才核銷得了。
            </p>
            <button
              type="button"
              className="btn-primary w-full"
              style={{ minHeight: 56 }}
              disabled={busy}
              onClick={() =>
                run(
                  () => api.post(`/stalls/${stallId}/sub-orders/${id}/confirm`),
                  '已確認接單，訂單成立',
                )
              }
            >
              確認接單
            </button>
            <button
              type="button"
              className="btn-secondary w-full text-red-600"
              disabled={busy}
              onClick={() =>
                run(
                  () =>
                    api.patch(`/stalls/${stallId}/sub-orders/${id}/status`, {
                      status: 'CANCELLED',
                    }),
                  '已婉拒這筆訂單',
                )
              }
            >
              婉拒這筆訂單
            </button>
          </div>
        ) : null}

        {isPending ? (
          <div className="mt-2 space-y-2">
            <button
              type="button"
              className="btn-primary w-full"
              style={{ minHeight: 56 }}
              disabled={busy}
              onClick={() =>
                run(
                  () => api.post(`/stalls/${stallId}/sub-orders/${id}/pickup`),
                  '已標記為取貨完成',
                )
              }
            >
              已取貨
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api.patch(`/stalls/${stallId}/sub-orders/${id}/status`, {
                        status: 'NO_SHOW',
                      }),
                    '已標記為未取',
                  )
                }
              >
                未取
              </button>
              <button
                type="button"
                className="btn-secondary flex-1 text-red-600"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api.patch(`/stalls/${stallId}/sub-orders/${id}/status`, {
                        status: 'CANCELLED',
                      }),
                    '已取消這筆訂單',
                  )
                }
              >
                取消
              </button>
            </div>
          </div>
        ) : null}

        {!isPending && !needsConfirm ? (
          <p className="mt-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-sm text-neutral-600">
            這筆訂單已是終態，不能再變更。若標錯了請聯繫主辦單位。
          </p>
        ) : null}
      </div>

      <Toast message={toast} />
    </>
  )
}
