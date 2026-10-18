import { Outlet, useParams } from 'react-router-dom'
import type { MarketDayDetail } from '@market/shared'
import { useApi } from '@/api/useApi'
import { BackLink, EmptyState, ErrorState, Spinner, formatTaipeiDate } from '@/components/common'
import { Toast } from '@/components/form'
import { DayFab, ProductCard, useDayShopping, type PublicListing } from './MarketDayPage'

/** C3 攤商頁：單一攤商在該場次的商品 */
export default function StallPage() {
  const { dayId = '', stallId = '' } = useParams()
  const day = useApi<MarketDayDetail>(`/market-days/${dayId}`)
  const listings = useApi<{ items: PublicListing[] }>(
    `/market-days/${dayId}/listings?stallId=${stallId}`,
  )
  const { cart, toast, quickAdd, outletContext } = useDayShopping(dayId)

  if (day.loading || listings.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={day.reload} />
  if (!day.data) return null

  const participation = day.data.participations.find((p) => p.stall.id === stallId)
  if (!participation) {
    return <EmptyState title="這個攤商沒有參加本場次" />
  }

  const items = listings.data?.items ?? []
  const base = `/days/${dayId}/stalls/${stallId}`

  return (
    <>
      <section className="border-b border-neutral-200 bg-white px-4 pb-4 pt-1">
        <BackLink to={`/days/${dayId}`} label="回場次" />
        <h1 className="text-xl font-bold">{participation.stall.name}</h1>
        {participation.stall.description ? (
          <p className="mt-1 text-sm text-neutral-600">{participation.stall.description}</p>
        ) : null}
        <p className="mt-2 text-sm text-neutral-600">
          {formatTaipeiDate(day.data.eventDate)}・攤位 {participation.boothNo}
        </p>
      </section>

      {items.length === 0 ? (
        <EmptyState title="這個攤商還沒上架商品" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 px-4 pb-44 pt-4">
          {items.map((l) => (
            <li key={l.listingId}>
              <ProductCard
                listing={l}
                to={`${base}/products/${l.listingId}`}
                onQuickAdd={quickAdd}
              />
            </li>
          ))}
        </ul>
      )}

      <DayFab dayId={dayId} cart={cart} />
      <Toast message={toast} position="top" />
      <Outlet context={outletContext} />
    </>
  )
}
