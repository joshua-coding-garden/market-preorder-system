import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MarketDayListItem, Paged } from '@market/shared'
import { ApiError, api } from '@/api/client'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  deadlineCountdown,
  formatTaipeiDate,
} from '@/components/common'
import HowItWorks from '@/components/HowItWorks'
import { errorMessage } from '@/i18n/zh-TW'

/** C1 場次列表：最近的已發布場次 */
export default function MarketDayList() {
  const [days, setDays] = useState<MarketDayListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (): void => {
    setError(null)
    setDays(null)
    api
      .get<Paged<MarketDayListItem>>('/market-days')
      .then((res) => setDays(res.items))
      .catch((err: unknown) =>
        setError(errorMessage(err instanceof ApiError ? err.code : undefined)),
      )
  }

  useEffect(load, [])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!days) return <Spinner />

  return (
    <>
      <PageHeader title="本週市集" subtitle="選擇場次開始預購" />

      {/* 委託方 2026-09-20：首頁要有使用說明 */}
      <HowItWorks />

      {days.length === 0 ? (
        <EmptyState title="目前沒有開放預購的場次" hint="市集開放後會在這裡顯示" />
      ) : (
        <ul className="space-y-3 px-4">
          {days.map((day) => (
            <li key={day.id}>
              <Link to={`/days/${day.id}`} className="card block p-4 active:bg-neutral-50">
                <p className="text-lg font-semibold text-neutral-900">
                  {formatTaipeiDate(day.eventDate)}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {day.market.name}・{day.market.location}
                </p>
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
