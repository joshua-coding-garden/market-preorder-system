import { Link } from 'react-router-dom'
import type { MarketBrief } from '@market/shared'
import { useApi } from '@/api/useApi'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'
import HowItWorks from '@/components/HowItWorks'

/** C0 市集入口（規格外）：每個市集一顆按鈕，點進去看該市集的場次 */
export default function MarketHome() {
  const { data, loading, error, reload } = useApi<{ items: MarketBrief[] }>('/markets')

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <Spinner />

  return (
    <>
      <PageHeader title="市集預購" subtitle="選擇市集" />

      {/* 委託方 2026-09-20：首頁要有使用說明。首頁現在是市集入口，說明放這裡 */}
      <HowItWorks />

      {data.items.length === 0 ? (
        <EmptyState title="目前沒有市集" hint="市集建立後會在這裡顯示" />
      ) : (
        <ul className="space-y-3 px-4">
          {data.items.map((m) => (
            <li key={m.id}>
              <Link to={`/markets/${m.id}`} className="card block p-6 active:bg-neutral-50">
                <p className="text-xl font-bold text-neutral-900">{m.name}</p>
                <p className="mt-1 text-sm text-neutral-600">{m.location}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
