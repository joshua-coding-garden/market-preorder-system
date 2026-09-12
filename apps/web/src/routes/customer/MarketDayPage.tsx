import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ListingStatus, MarketDayDetail } from '@market/shared'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  MoneyTWD,
  Spinner,
  deadlineCountdown,
  formatTaipeiDate,
} from '@/components/common'
import { inputClass } from '@/components/form'
import { useSession } from '@/store/session'
import type { CartData } from '@/api/cartTypes'

export interface PublicListing {
  listingId: string
  productId: string
  code: string
  name: string
  description: string | null
  imageUrl: string | null
  thumbUrl: string | null
  price: number
  maxQty: number | null
  status: ListingStatus
  stall: { id: string; name: string; boothNo: string }
  components: { id: string; name: string; extraPrice: number; allowCustomNote: boolean }[]
}

/** C2 場次頁：場次資訊、攤商 chips、商品格狀列表、搜尋 */
export default function MarketDayPage() {
  const { dayId = '' } = useParams()
  const { me } = useSession()
  const day = useApi<MarketDayDetail>(`/market-days/${dayId}`)
  const listings = useApi<{ items: PublicListing[] }>(`/market-days/${dayId}/listings`)
  const cart = useApi<CartData>(me ? `/cart?marketDayId=${dayId}` : null)

  const [stallFilter, setStallFilter] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const items = listings.data?.items ?? []
    const keyword = q.trim().toLowerCase()
    return items.filter(
      (l) =>
        (!stallFilter || l.stall.id === stallFilter) &&
        (!keyword ||
          l.name.toLowerCase().includes(keyword) ||
          l.code.toLowerCase().includes(keyword)),
    )
  }, [listings.data, stallFilter, q])

  if (day.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={day.reload} />
  if (!day.data) return null

  const d = day.data

  return (
    <>
      <section className="border-b border-neutral-200 bg-white px-4 pb-4 pt-5">
        <h1 className="text-xl font-bold">{formatTaipeiDate(d.eventDate)}</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {d.market.name}・{d.market.location}
        </p>
        {d.locationNote ? (
          <p className="text-sm text-neutral-500">{d.locationNote}</p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-600 tabular-nums">
          營業 {d.openTime}–{d.closeTime}
        </p>
        <p className="mt-2 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          {deadlineCountdown(d.orderDeadline)}
        </p>
      </section>

      <div className="sticky top-[57px] z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setStallFilter(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 ${
              stallFilter === null
                ? 'bg-brand-500 font-medium text-white'
                : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            全部
          </button>
          {d.participations.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStallFilter(p.stall.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 ${
                stallFilter === p.stall.id
                  ? 'bg-brand-500 font-medium text-white'
                  : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              {p.stall.name}
              <span className="ml-1 opacity-70">{p.boothNo}</span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-2.5">
          <input
            className={inputClass}
            placeholder="搜尋商品"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
          />
        </div>
      </div>

      {listings.loading ? <Spinner /> : null}
      {listings.error ? (
        <ErrorState message={listings.error} onRetry={listings.reload} />
      ) : null}
      {listings.data && filtered.length === 0 ? (
        <EmptyState title="沒有符合的商品" hint={q ? '換個關鍵字試試' : '攤商還沒上架商品'} />
      ) : null}

      {filtered.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 px-4 py-4 pb-28">
          {filtered.map((l) => (
            <li key={l.listingId}>
              <ProductCard listing={l} dayId={dayId} />
            </li>
          ))}
        </ul>
      ) : null}

      {cart.data && cart.data.itemCount > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-20 w-full max-w-screen-sm -translate-x-1/2 px-4">
          <Link
            to={`/days/${dayId}/cart`}
            className="btn-primary flex w-full items-center justify-between shadow-lg"
          >
            <span>
              購物車
              <span className="ml-2 rounded-full bg-white/25 px-2 py-0.5 text-sm tabular-nums">
                {cart.data.itemCount}
              </span>
            </span>
            <MoneyTWD value={cart.data.total} />
          </Link>
        </div>
      ) : null}
    </>
  )
}

export function ProductCard({ listing, dayId }: { listing: PublicListing; dayId: string }) {
  const soldOut = listing.status === 'SOLD_OUT'
  return (
    <Link
      to={`/days/${dayId}/products/${listing.listingId}`}
      className={`card block overflow-hidden active:bg-neutral-50 ${soldOut ? 'opacity-60' : ''}`}
    >
      <div className="relative aspect-square bg-neutral-100">
        {listing.thumbUrl ? (
          <img src={listing.thumbUrl} alt={listing.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
            無圖片
          </div>
        )}
        {soldOut ? (
          <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs text-white">
            已售完
          </span>
        ) : null}
      </div>
      <div className="p-2.5">
        <p className="truncate text-sm font-medium">{listing.name}</p>
        <p className="mt-0.5 truncate text-xs text-neutral-500">
          {listing.stall.name}・{listing.stall.boothNo}
        </p>
        <p className="mt-1 text-sm font-semibold text-brand-700">
          <MoneyTWD value={listing.price} />
        </p>
      </div>
    </Link>
  )
}
