import { Link } from 'react-router-dom'
import type { OrderListItem } from '@/api/cartTypes'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  MoneyTWD,
  PageHeader,
  Spinner,
  formatTaipeiDate,
} from '@/components/common'
import { StatusBadge } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'
import { useSession } from '@/store/session'

/** 把多張子單的狀態濃縮成一句摘要 */
function summarize(statuses: string[]): { status: string; label: string } {
  if (statuses.length === 0) return { status: 'PENDING', label: '—' }
  const unique = [...new Set(statuses)]
  if (unique.length === 1) {
    return { status: unique[0], label: subOrderStatusLabel[unique[0]] }
  }
  // ⚠️ 規格外（2026-09-20）：只要還有攤沒確認，先講「確認中」——那是顧客最需要知道的
  const confirming = statuses.filter((s) => s === 'PENDING_CONFIRM').length
  if (confirming > 0) {
    return { status: 'PENDING_CONFIRM', label: `${confirming} 攤店家確認中` }
  }
  const pending = statuses.filter((s) => s === 'PENDING').length
  return pending > 0
    ? { status: 'PENDING', label: `${pending} 攤待取貨` }
    : { status: 'PICKED_UP', label: '部分完成' }
}

/** C8 我的訂單 */
export default function MyOrders() {
  const { me, loading: sessionLoading } = useSession()
  const { data, loading, error, reload } = useApi<{ items: OrderListItem[] }>(
    me ? '/orders' : null,
  )

  if (sessionLoading) return <Spinner />

  if (!me) {
    return (
      <>
        <PageHeader title="我的訂單" />
        <div className="px-4">
          <EmptyState title="請先登入" hint="登入後才看得到您的預購紀錄" />
          <Link to="/login?redirect=%2Forders" className="btn-primary w-full">
            前往登入
          </Link>
        </div>
      </>
    )
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const items = data?.items ?? []

  return (
    <>
      <PageHeader title="我的訂單" />

      {items.length === 0 ? (
        <EmptyState title="還沒有預購紀錄" hint="到場次頁挑選商品開始預購" />
      ) : (
        <ul className="space-y-3 px-4 pb-8">
          {items.map((o) => {
            const summary = summarize(o.statuses)
            return (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="card block p-4 active:bg-neutral-50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold">
                        {formatTaipeiDate(o.marketDay.eventDate)}
                      </p>
                      <p className="mt-0.5 text-sm text-neutral-600">{o.marketDay.marketName}</p>
                    </div>
                    <StatusBadge status={summary.status} label={summary.label} />
                  </div>
                  <p className="mt-2 flex items-baseline justify-between text-sm">
                    <span className="text-neutral-600">
                      {o.stallCount} 攤・取貨 <span className="tabular-nums">{o.pickupAt}</span>
                    </span>
                    <span className="font-semibold">
                      <MoneyTWD value={o.totalAmount} />
                    </span>
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
