import { Link, useParams } from 'react-router-dom'
import type { MarketBrief, MarketDayListItem, Paged } from '@market/shared'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  deadlineCountdown,
  formatTaipeiDate,
} from '@/components/common'

/** C1 場次列表：某市集最近的已發布場次（從 C0 市集入口點進來） */
export default function MarketDayList() {
  const { marketId = '' } = useParams()
  const markets = useApi<{ items: MarketBrief[] }>('/markets')
  const days = useApi<Paged<MarketDayListItem>>(`/market-days?marketId=${marketId}`)

  if (days.error) return <ErrorState message={days.error} onRetry={days.reload} />
  if (days.loading || !days.data) return <Spinner />

  const market = markets.data?.items.find((m) => m.id === marketId)

  return (
    <>
      <PageHeader title={market?.name ?? '場次列表'} subtitle="選擇場次開始預購" />

      {days.data.items.length === 0 ? (
        <EmptyState title="目前沒有開放預購的場次" hint="市集開放後會在這裡顯示" />
      ) : (
        <ul className="space-y-3 px-4">
          {days.data.items.map((day) => (
            <li key={day.id}>
              <Link to={`/days/${day.id}`} className="card block p-4 active:bg-neutral-50">
                <p className="text-lg font-semibold text-neutral-900">
                  {formatTaipeiDate(day.eventDate)}
                </p>
                <p className="mt-1 text-sm text-neutral-600">{day.market.location}</p>
                {day.locationNote ? (
                  <p className="text-sm text-neutral-500">{day.locationNote}</p>
                ) : null}

                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-600">
                  <div className="flex gap-1">
                    <dt className="text-neutral-400">營業</dt>
                    <dd className="tabular-nums">
                      {day.openTime}–{day.closeTime}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="text-neutral-400">攤商</dt>
                    <dd>{day.stallCount} 攤</dd>
                  </div>
                </dl>

                <p className="mt-3 inline-block rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
                  {deadlineCountdown(day.orderDeadline)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
