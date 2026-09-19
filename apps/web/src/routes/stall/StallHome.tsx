import { useState } from 'react'
import { Link } from 'react-router-dom'
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

interface StallDayRow {
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

/** S1 攤商首頁：我的攤商、即將到來的場次、輸入邀請碼入口 */
export default function StallHome() {
  const { me } = useSession()
  const stalls = me?.stalls ?? []
  const [selected, setSelected] = useState<string | null>(null)
  const stallId = selected ?? stalls[0]?.id ?? null

  const { data, loading, error, reload } = useApi<{ items: StallDayRow[] }>(
    stallId ? `/stalls/${stallId}/market-days` : null,
  )

  if (stalls.length === 0) {
    return (
      <>
        <PageHeader title="攤商專區" />
        <div className="px-4">
          <EmptyState
            title="您還沒有綁定攤商"
            hint="向主辦單位索取邀請碼，綁定後就能管理商品與訂單"
          />
          <Link to="/stall/redeem" className="btn-primary w-full">
            輸入邀請碼
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="攤商專區"
        action={
          <Link to="/stall/redeem" className="btn-secondary text-sm">
            輸入邀請碼
          </Link>
        }
      />

      {stalls.length > 1 ? (
        <div className="mb-3 flex gap-1 overflow-x-auto px-4 text-sm">
          {stalls.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
                stallId === s.id
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-neutral-600'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      <h2 className="px-4 pb-2 text-base font-semibold">場次</h2>

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
                {row.marketDay.openTime}–{row.marketDay.closeTime}{'  '}截止{' '}
                {formatTaipeiDateTime(row.marketDay.orderDeadline)}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link
                  to={`/stall/${stallId}/days/${row.marketDay.id}/listings`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  本場上架
                </Link>
                <Link
                  to={`/stall/${stallId}/days/${row.marketDay.id}/orders`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  訂單
                </Link>
                <Link
                  to={`/stall/${stallId}/days/${row.marketDay.id}/prep`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  備貨總表
                </Link>
                <Link
                  to={`/stall/${stallId}/days/${row.marketDay.id}/pickup`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  核銷
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2 px-4 pb-8">
        <Link to={`/stall/${stallId}/products`} className="btn-secondary flex-1">
          商品管理
        </Link>
        {/* 委託方 2026-09-20：攤商要能自己看／改基本資料 */}
        <Link to={`/stall/${stallId}/profile`} className="btn-secondary flex-1">
          基本資料
        </Link>
      </div>
    </>
  )
}
