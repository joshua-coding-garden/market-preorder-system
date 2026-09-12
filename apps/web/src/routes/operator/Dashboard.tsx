import { Link } from 'react-router-dom'
import type { MarketDayStatus } from '@market/shared'
import { useApi } from '@/api/useApi'
import {
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDate,
  formatTaipeiDateTime,
} from '@/components/common'
import { StatusBadge } from '@/components/form'
import { marketDayStatusLabel } from '@/i18n/zh-TW'

interface OperatorDay {
  id: string
  market: { name: string }
  eventDate: string
  openTime: string
  closeTime: string
  orderDeadline: string
  status: MarketDayStatus
  stallCount: number
  preorderCount: number
}

interface QuotaInfo {
  monthUsed: number
  monthQuota: number
  pendingReview: number
}

/** O1 儀表板：下一場次摘要 + 本月訊息額度 */
export default function Dashboard() {
  const days = useApi<{ items: OperatorDay[] }>('/operator/market-days')
  const quota = useApi<QuotaInfo>('/operator/message-quota')

  if (days.loading) return <Spinner />
  if (days.error) return <ErrorState message={days.error} onRetry={days.reload} />

  // 最近一場尚未結案的場次
  const upcoming = (days.data?.items ?? [])
    .filter((d) => d.status !== 'CLOSED')
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0]

  const used = quota.data?.monthUsed ?? 0
  const limit = quota.data?.monthQuota ?? 0
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0

  return (
    <>
      <PageHeader title="儀表板" />

      <div className="space-y-4 px-4 pb-8">
        <section className="card p-4">
          <h2 className="text-sm font-medium text-neutral-500">下一場次</h2>
          {upcoming ? (
            <>
              <div className="mt-1 flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">{formatTaipeiDate(upcoming.eventDate)}</p>
                  <p className="mt-0.5 text-sm text-neutral-600">{upcoming.market.name}</p>
                </div>
                <StatusBadge
                  status={upcoming.status}
                  label={marketDayStatusLabel[upcoming.status]}
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-neutral-100 py-2.5">
                  <dt className="text-xs text-neutral-500">攤商</dt>
                  <dd className="text-xl font-bold tabular-nums">{upcoming.stallCount}</dd>
                </div>
                <div className="rounded-xl bg-neutral-100 py-2.5">
                  <dt className="text-xs text-neutral-500">訂單</dt>
                  <dd className="text-xl font-bold tabular-nums">{upcoming.preorderCount}</dd>
                </div>
                <div className="rounded-xl bg-amber-50 py-2.5">
                  <dt className="text-xs text-amber-700">待審推播</dt>
                  <dd className="text-xl font-bold tabular-nums text-amber-800">
                    {quota.data?.pendingReview ?? 0}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-neutral-500">
                預購截止 {formatTaipeiDateTime(upcoming.orderDeadline)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link
                  to={`/operator/days/${upcoming.id}`}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5"
                >
                  場次詳情
                </Link>
                <Link
                  to={`/operator/days/${upcoming.id}/orders`}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5"
                >
                  訂單總覽
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">
              沒有進行中的場次。到「場次」建立一場。
            </p>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-medium text-neutral-500">本月 LINE 訊息額度</h2>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {used}
            <span className="text-base font-normal text-neutral-400"> / {limit}</span>
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full rounded-full ${percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            推播與系統通知都算在同一個額度內。超過額度時系統會阻擋並記錄，不會靜默送出。
          </p>
          <Link to="/operator/broadcasts" className="btn-secondary mt-3 w-full text-sm">
            推播審核
          </Link>
        </section>
      </div>
    </>
  )
}
