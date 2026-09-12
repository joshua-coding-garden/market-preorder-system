import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, MoneyTWD, Spinner } from '@/components/common'
import ComponentPicker, { type ComponentSelection } from '@/components/ComponentPicker'
import { FormError, Toast } from '@/components/form'
import { useSession } from '@/store/session'
import type { PublicListing } from './MarketDayPage'

/** C4 商品詳情：內容物勾選、數量 stepper、即時小計、加入購物車 */
export default function ProductDetail() {
  const { dayId = '', listingId = '' } = useParams()
  const navigate = useNavigate()
  const { me } = useSession()
  const listings = useApi<{ items: PublicListing[] }>(`/market-days/${dayId}/listings`)

  const [selected, setSelected] = useState<ComponentSelection[]>([])
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const listing = listings.data?.items.find((l) => l.listingId === listingId)

  const extras = useMemo(() => {
    if (!listing) return 0
    return selected.reduce((sum, s) => {
      const c = listing.components.find((x) => x.id === s.componentId)
      return sum + (c?.extraPrice ?? 0)
    }, 0)
  }, [listing, selected])

  if (listings.loading) return <Spinner />
  if (listings.error) return <ErrorState message={listings.error} onRetry={listings.reload} />
  if (!listing) return <ErrorState message="找不到這個商品" />

  const soldOut = listing.status !== 'ON_SALE'
  const unitPrice = listing.price + extras
  const lineTotal = unitPrice * qty

  const addToCart = async () => {
    if (!me) {
      navigate(`/login?redirect=${encodeURIComponent(`/days/${dayId}/products/${listingId}`)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post('/cart/items', {
        marketDayId: dayId,
        listingId,
        qty,
        components: selected.map((s) => ({
          componentId: s.componentId,
          ...(s.customNote?.trim() ? { customNote: s.customNote.trim() } : {}),
        })),
      })
      setToast('已加入購物車')
      setTimeout(() => navigate(`/days/${dayId}`), 700)
    } catch (err) {
      setError(err instanceof ApiError ? toMessage(err) : '加入失敗，請稍後再試')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-32">
      <div className="aspect-square w-full bg-neutral-100">
        {listing.imageUrl ?? listing.thumbUrl ? (
          <img
            src={listing.imageUrl ?? listing.thumbUrl ?? ''}
            alt={listing.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
            無圖片
          </div>
        )}
      </div>

      <div className="space-y-5 px-4 pt-4">
        <div>
          <p className="text-sm text-neutral-500">
            {listing.stall.name}・攤位 {listing.stall.boothNo}
          </p>
          <h1 className="mt-1 text-xl font-bold">{listing.name}</h1>
          <p className="mt-0.5 font-mono text-xs text-neutral-400">{listing.code}</p>
          {listing.description ? (
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{listing.description}</p>
          ) : null}
          <p className="mt-3 text-2xl font-bold text-brand-700">
            <MoneyTWD value={listing.price} />
          </p>
          {soldOut ? (
            <p className="mt-2 inline-block rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-700">
              已售完，暫時無法預購
            </p>
          ) : null}
        </div>

        <ComponentPicker
          options={listing.components}
          value={selected}
          onChange={setSelected}
          disabled={soldOut}
        />

        <div>
          <span className="text-sm font-medium text-neutral-700">數量</span>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="h-11 w-11 rounded-xl border border-neutral-300 text-xl"
              disabled={soldOut || qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="減少數量"
            >
              −
            </button>
            <span className="w-10 text-center text-lg font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              className="h-11 w-11 rounded-xl border border-neutral-300 text-xl"
              disabled={soldOut || qty >= 99}
              onClick={() => setQty((q) => Math.min(99, q + 1))}
              aria-label="增加數量"
            >
              ＋
            </button>
          </div>
        </div>

        <FormError message={error} />
      </div>

      <div className="fixed bottom-0 left-1/2 w-full max-w-screen-sm -translate-x-1/2 border-t border-neutral-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="text-neutral-600">
            小計
            {extras > 0 ? (
              <span className="ml-1 text-xs text-neutral-400">
                （{listing.price} + {extras}）× {qty}
              </span>
            ) : null}
          </span>
          <span className="text-xl font-bold">
            <MoneyTWD value={lineTotal} />
          </span>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={soldOut || busy}
          onClick={addToCart}
        >
          {soldOut ? '已售完' : busy ? '加入中…' : '加入購物車'}
        </button>
      </div>

      <Toast message={toast} />
    </div>
  )
}
