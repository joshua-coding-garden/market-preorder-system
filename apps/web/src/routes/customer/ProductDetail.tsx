import { useNavigate, useParams } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { ErrorState, MoneyTWD, Spinner } from '@/components/common'
import type { PublicListing } from './MarketDayPage'

/**
 * C4 商品詳情（Sprint 2：唯讀展示）。
 * Sprint 3 會在這裡加上 ComponentPicker、數量 stepper 與「加入購物車」。
 */
export default function ProductDetail() {
  const { dayId = '', listingId = '' } = useParams()
  const navigate = useNavigate()
  const listings = useApi<{ items: PublicListing[] }>(`/market-days/${dayId}/listings`)

  if (listings.loading) return <Spinner />
  if (listings.error) return <ErrorState message={listings.error} onRetry={listings.reload} />

  const listing = listings.data?.items.find((l) => l.listingId === listingId)
  if (!listing) return <ErrorState message="找不到這個商品" />

  return (
    <div className="pb-8">
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

      <div className="px-4 pt-4">
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
        {listing.status === 'SOLD_OUT' ? (
          <p className="mt-2 inline-block rounded-full bg-neutral-200 px-3 py-1 text-sm text-neutral-700">
            已售完
          </p>
        ) : null}

        {listing.components.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-base font-semibold">內容物</h2>
            <ul className="mt-2 space-y-2">
              {listing.components.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
                >
                  <span>{c.name}</span>
                  <span className="text-neutral-600">
                    {c.extraPrice > 0 ? `+${c.extraPrice}` : '不加價'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-6 rounded-xl bg-neutral-100 px-3 py-3 text-sm text-neutral-600">
          購物車與下單功能在 Sprint 3 開放。
        </p>

        <button type="button" className="btn-secondary mt-4 w-full" onClick={() => navigate(-1)}>
          返回
        </button>
      </div>
    </div>
  )
}
