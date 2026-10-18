import { Link, useLocation } from 'react-router-dom'
import type { MarketBrief } from '@market/shared'
import { useApi } from '@/api/useApi'
import { EmptyState, ErrorState, Spinner } from '@/components/common'
import HowItWorks from '@/components/HowItWorks'
import { Icon } from '@/components/icons'
import { useSession } from '@/store/session'

/** C0 市集入口（規格外）：每個市集一顆按鈕，點進去看該市集的場次 */
export default function MarketHome() {
  const { data, loading, error, reload } = useApi<{ items: MarketBrief[] }>('/markets')
  const { me, loading: sessionLoading } = useSession()
  const location = useLocation()

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <Spinner />

  return (
    <div className="pt-4">
      {/* ⚠️ 規格外（2026-10-18，參考 OnlineMenu）：未登入時提示登入 */}
      {!me && !sessionLoading ? (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 py-3 pl-4 pr-3">
          <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-orange-800">
            登入後可以保留訂單紀錄，下次訂購更快
          </p>
          <Link
            to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-amber-500 px-5 text-[15px] font-bold text-white"
          >
            登入
          </Link>
        </div>
      ) : null}

      <h1 className="px-4 pb-2.5 text-base font-bold text-neutral-900">選擇市集</h1>

      {data.items.length === 0 ? (
        <EmptyState title="目前沒有市集" hint="市集建立後會在這裡顯示" />
      ) : (
        <ul className="space-y-3 px-4">
          {data.items.map((m) => (
            <li key={m.id}>
              <Link
                to={`/markets/${m.id}`}
                className="flex items-center gap-3.5 rounded-[20px] border border-brand-100 bg-white p-4 shadow-sm active:bg-neutral-50"
              >
                <MarketBadge name={m.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[19px] font-bold text-orange-900">{m.name}</p>
                  <p className="mt-0.5 truncate text-sm text-neutral-500">{m.location}</p>
                </div>
                <Icon name="forward" size={20} strokeWidth={2.2} className="shrink-0 text-neutral-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* 委託方 2026-09-20：首頁要有使用說明。首頁現在是市集入口，說明放這裡 */}
      <div className="mt-5">
        <HowItWorks />
      </div>
    </div>
  )
}

/** 市集沒有圖片欄位，先用名稱第一個字當徽章 */
export function MarketBadge({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border-[3px] border-brand-100 bg-brand-50 font-bold text-brand-700 ${
        size === 'lg' ? 'h-16 w-16 text-2xl' : 'h-14 w-14 text-xl'
      }`}
    >
      {name.slice(0, 1)}
    </span>
  )
}
