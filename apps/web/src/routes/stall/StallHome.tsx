import { Link, Navigate, useParams } from 'react-router-dom'
import type { MarketDayStatus } from '@market/shared'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDate,
  formatTaipeiDateTime,
} from '@/components/common'
import { StatusBadge } from '@/components/form'
import { marketDayStatusLabel } from '@/i18n/zh-TW'
import { useSession } from '@/store/session'

export interface StallDayRow {
  participationId: string
  boothNo: string
  marketDay: {
    id: string
    eventDate: string
    openTime: string
    closeTime: string
    orderDeadline: string
    status: MarketDayStatus
    market: { id: string; name: string }
  }
}

/** 場次卡片上的四個入口；場次子頁上方的頁籤也用同一份 */
export const DAY_SECTIONS = [
  { path: 'listings', label: '上架' },
  { path: 'orders', label: '訂單' },
  { path: 'prep', label: '備貨' },
  { path: 'pickup', label: '核銷' },
] as const

/**
 * S1 攤商首頁：我的場次。
 * ⚠️ 規格外（2026-10-18）：攤商 id 改放網址（/stall/:stallId），切換攤商、商品管理、
 * 基本資料、輸入邀請碼都移到 ☰ 選單。/stall 會導到第一個攤商。
 */
export default function StallHome() {
  const { stallId } = useParams()
  const { me } = useSession()
  const first = me?.stalls[0]?.id

  const { data, loading, error, reload } = useApi<{ items: StallDayRow[] }>(
    stallId ? `/stalls/${stallId}/market-days` : null,
  )

  if (!stallId) {
    if (first) return <Navigate to={`/stall/${first}`} replace />
    return (
      <>
        <PageHeader title="攤商專區" />
        <div className="px-4">
          <EmptyState
            title="您還沒有綁定攤商"
            hint={
              me?.capabilities.operator
                ? '管理員可以從市集後台的「攤商」進入任一攤代管'
                : '向主辦單位索取邀請碼，綁定後就能管理商品與訂單'
            }
          />
          <Link
            to={me?.capabilities.operator ? '/operator/stalls' : '/stall/redeem'}
            className="btn-primary w-full"
          >
            {me?.capabilities.operator ? '前往市集後台' : '輸入邀請碼'}
          </Link>
        </div>
      </>
    )
  }

  const stallName = me?.stalls.find((s) => s.id === stallId)?.name

  return (
    <>
      <PageHeader title="我的場次" subtitle={stallName} />

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="還沒有參加任何場次" hint="主辦單位把您加入場次後就會顯示在這裡" />
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {data.items.map((row) => (
            <li key={row.participationId} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">
                    {formatTaipeiDate(row.marketDay.eventDate)}
                  </p>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    {row.marketDay.market.name}・攤位 {row.boothNo}
                  </p>
                </div>
                <StatusBadge
                  status={row.marketDay.status}
                  label={marketDayStatusLabel[row.marketDay.status]}
                />
              </div>
              <p className="mt-2 text-sm text-neutral-600 tabular-nums">
                {row.marketDay.openTime}–{row.marketDay.closeTime}{'  '}預購截止{' '}
                {formatTaipeiDateTime(row.marketDay.orderDeadline)}
              </p>

              <div className="mt-3 grid grid-cols-4 gap-1.5 text-sm">
                {DAY_SECTIONS.map((s) => (
                  <Link
                    key={s.path}
                    to={`/stall/${stallId}/days/${row.marketDay.id}/${s.path}`}
                    className="flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 active:bg-neutral-50"
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
