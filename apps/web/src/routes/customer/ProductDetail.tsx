import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, MoneyTWD, Spinner } from '@/components/common'
import ComponentPicker, { type ComponentSelection } from '@/components/ComponentPicker'
import { FormError, inputClass } from '@/components/form'
import Sheet from '@/components/Sheet'
import { useSession } from '@/store/session'
import type { DayOutletContext, PublicListing } from './MarketDayPage'

/**
 * C4 商品詳情：內容物勾選、數量 stepper、即時小計、加入購物車。
 *
 * ⚠️ 規格外（2026-10-18，參考 OnlineMenu）：從整頁改成疊在場次頁／攤商頁上的彈窗，
 * 掛在它們底下的巢狀路由。網址跟原本一樣，LINE 分享出去的商品連結照樣打得開。
 */
export default function ProductDetail() {
  const { dayId = '', listingId = '', stallId } = useParams()
  const navigate = useNavigate()
  const outlet = useOutletContext<DayOutletContext | undefined>()
  const { me } = useSession()
  const listings = useApi<{ items: PublicListing[] }>(`/market-days/${dayId}/listings`)

  const [selected, setSelected] = useState<ComponentSelection[]>([])
  const [note, setNote] = useState('')
  const [qty, setQty] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listing = listings.data?.items.find((l) => l.listingId === listingId)
  const backTo = stallId ? `/days/${dayId}/stalls/${stallId}` : `/days/${dayId}`
  const close = () => navigate(backTo)

  const extras = useMemo(() => {
    if (!listing) return 0
    return selected.reduce((sum, s) => {
      const c = listing.components.find((x) => x.id === s.componentId)
      return sum + (c?.extraPrice ?? 0)
    }, 0)
  }, [listing, selected])

  if (listings.loading) {
    return (
      <Sheet title="商品" onClose={close}>
        <Spinner />
      </Sheet>
    )
  }
  if (listings.error || !listing) {
    return (
      <Sheet title="商品" onClose={close}>
        <ErrorState
          message={listings.error ?? '找不到這個商品'}
          onRetry={listings.error ? listings.reload : undefined}
        />
      </Sheet>
    )
  }

  const soldOut = listing.status !== 'ON_SALE'
  const unitPrice = listing.price + extras
  const lineTotal = unitPrice * qty

  const addToCart = async () => {
    if (!me) {
      navigate(`/login?redirect=${encodeURIComponent(`${backTo}/products/${listingId}`)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post('/cart/items', {
        marketDayId: dayId,
        listingId,
        qty,
        components: selected.map((s) => ({ componentId: s.componentId })),
        ...(note.trim() ? { customNote: note.trim() } : {}),
      })
      outlet?.onAdded('已加入購物車')
      close()
    } catch (err) {
      setError(err instanceof ApiError ? toMessage(err) : '加入失敗，請稍後再試')
      setBusy(false)
    }
  }

  return (
    <Sheet title={listing.name} onClose={close}>
      <div className="space-y-5">
        <div className="flex gap-3.5">
          <div className="h-[104px] w-[104px] shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
            {listing.imageUrl ?? listing.thumbUrl ? (
              <img
                src={listing.imageUrl ?? listing.thumbUrl ?? ''}
                alt={listing.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
                無圖片
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-neutral-500">
              {listing.stall.name}・攤位 {listing.stall.boothNo}
            </p>
            <p className="mt-0.5 font-mono text-xs text-neutral-400">{listing.code}</p>
            <p className="mt-1.5 text-2xl font-bold text-brand-700">
              <MoneyTWD value={listing.price} />
            </p>
            {soldOut ? (
              <p className="mt-1 inline-block rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-700">
                已售完，暫時無法預購
              </p>
            ) : null}
          </div>
        </div>

        {listing.description ? (
          <p className="text-sm leading-relaxed text-neutral-600">{listing.description}</p>
        ) : null}

        <ComponentPicker
          options={listing.components}
          value={selected}
          onChange={setSelected}
          disabled={soldOut}
        />

        <div>
          <label htmlFor="item-note" className="text-sm font-medium text-neutral-700">
            特製備註
          </label>
          <p className="mt-0.5 text-xs text-neutral-500">
            這一項要跟攤商說的話，例如「不要太焦」
          </p>
          <textarea
            id="item-note"
            className={`${inputClass} mt-2`}
            rows={2}
            maxLength={100}
            placeholder="選填"
            value={note}
            disabled={soldOut}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700">數量</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="h-11 w-11 rounded-full border border-neutral-300 text-xl"
              disabled={soldOut || qty <= 1}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="減少數量"
            >
              −
            </button>
            <span className="w-10 text-center text-lg font-semibold tabular-nums">{qty}</span>
            <button
              type="button"
              className="h-11 w-11 rounded-full border border-brand-500 bg-brand-50 text-xl text-brand-700"
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

      <div className="sticky -bottom-4 -mx-4 mt-4 border-t border-neutral-200 bg-white px-4 pb-4 pt-3">
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
        <div className="grid grid-cols-3 gap-2.5">
          <button type="button" className="btn-secondary" onClick={close}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary col-span-2"
            disabled={soldOut || busy}
            onClick={addToCart}
          >
            {soldOut ? '已售完' : busy ? '加入中…' : '加入購物車'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
