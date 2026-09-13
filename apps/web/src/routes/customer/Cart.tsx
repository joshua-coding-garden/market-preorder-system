import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { CartData } from '@/api/cartTypes'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { EmptyState, ErrorState, MoneyTWD, PageHeader, Spinner } from '@/components/common'
import { FormError } from '@/components/form'

/** C5 購物車：按攤商分組、數量 stepper、刪除、unavailable 標示 */
export default function Cart() {
  const { dayId = '' } = useParams()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useApi<CartData>(`/cart?marketDayId=${dayId}`)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const setQty = async (itemId: string, qty: number) => {
    setBusy(itemId)
    setActionError(null)
    try {
      await api.patch(`/cart/items/${itemId}`, { qty })
      reload()
    } catch (err) {
      setActionError(toMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const isEmpty = data.stalls.length === 0

  return (
    <>
      <PageHeader title="購物車" subtitle={isEmpty ? undefined : `${data.itemCount} 件商品`} />

      <div className="px-4">
        <FormError message={actionError} />
      </div>

      {isEmpty ? (
        <div className="px-4">
          <EmptyState title="購物車是空的" hint="回場次頁挑選商品吧" />
          <Link to={`/days/${dayId}`} className="btn-secondary w-full">
            回場次頁
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4 px-4 pb-40">
            {data.stalls.map((group) => (
              <section key={group.stall.id} className="card overflow-hidden">
                <header className="flex items-baseline justify-between border-b border-neutral-200 px-4 py-2.5">
                  <h2 className="text-base font-semibold">{group.stall.name}</h2>
                  <span className="text-xs text-neutral-500">攤位 {group.stall.boothNo}</span>
                </header>

                <ul className="divide-y divide-neutral-100">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={`px-4 py-3 ${item.unavailable ? 'bg-neutral-50' : ''}`}
                    >
                      <div className="flex gap-3">
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                          {item.thumbUrl ? (
                            <img
                              src={item.thumbUrl}
                              alt={item.productName}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {item.productName}
                            </span>
                            {item.unavailable ? (
                              <span className="shrink-0 rounded-full bg-neutral-300 px-2 py-0.5 text-[10px] text-neutral-700">
                                {item.status === 'SOLD_OUT' ? '已售完' : '已下架'}
                              </span>
                            ) : null}
                          </p>

                          {item.components.length > 0 ? (
                            <ul className="mt-1 space-y-0.5">
                              {item.components.map((c) => (
                                <li key={c.componentId} className="text-xs text-neutral-500">
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

                          <p className="mt-1 text-xs text-neutral-500">
                            單價 <MoneyTWD value={item.unitPrice} />
                          </p>

                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="h-8 w-8 rounded-lg border border-neutral-300 text-lg leading-none"
                                disabled={busy === item.id}
                                onClick={() => setQty(item.id, item.qty - 1)}
                                aria-label="減少數量"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-sm tabular-nums">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                className="h-8 w-8 rounded-lg border border-neutral-300 text-lg leading-none"
                                disabled={busy === item.id || item.qty >= 99}
                                onClick={() => setQty(item.id, item.qty + 1)}
                                aria-label="增加數量"
                              >
                                ＋
                              </button>
                              <button
                                type="button"
                                className="ml-1 text-xs text-red-600"
                                disabled={busy === item.id}
                                onClick={() => setQty(item.id, 0)}
                              >
                                刪除
                              </button>
                            </div>
                            <span className="text-sm font-semibold">
                              <MoneyTWD value={item.lineTotal} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <footer className="flex justify-between border-t border-neutral-200 px-4 py-2.5 text-sm">
                  <span className="text-neutral-600">小計</span>
                  <span className="font-semibold">
                    <MoneyTWD value={group.subtotal} />
                  </span>
                </footer>
              </section>
            ))}
          </div>

          <div className="fixed bottom-0 left-1/2 w-full max-w-screen-sm -translate-x-1/2 border-t border-neutral-200 bg-white p-4">
            {data.hasUnavailable ? (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                有商品已售完或下架，請先移除才能結帳。
              </p>
            ) : null}
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm text-neutral-600">總計</span>
              <span className="text-xl font-bold">
                <MoneyTWD value={data.total} />
              </span>
            </div>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={data.hasUnavailable || data.total === 0}
              onClick={() => navigate(`/days/${dayId}/checkout`)}
            >
              前往結帳
            </button>
          </div>
        </>
      )}
    </>
  )
}
