import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDateTime,
} from '@/components/common'
import { StatusBadge } from '@/components/form'
import { broadcastStatusLabel } from '@/i18n/zh-TW'

interface BroadcastRow {
  id: string
  composeMode: string
  title: string
  bodyText: string
  audience: string
  status: string
  createdAt: string
  recipientCount: number | null
  stall: { id: string; name: string } | null
  marketDay: { id: string; eventDate: string } | null
}

const TABS = [
  { value: 'PENDING_REVIEW', label: '待審' },
  { value: 'DRAFT', label: '待代寫' },
  { value: 'APPROVED', label: '已核准' },
  { value: 'SENT', label: '已送出' },
  { value: 'REJECTED', label: '退回' },
  { value: '', label: '全部' },
]

const COMPOSE_LABEL: Record<string, string> = {
  STALL_COMPOSE: '攤商自寫',
  OPERATOR_COMPOSE: '廠商代寫',
}

/** O7 推播審核列表 */
export default function OperatorBroadcasts() {
  const [tab, setTab] = useState('PENDING_REVIEW')
  const { data, loading, error, reload } = useApi<{ items: BroadcastRow[] }>(
    `/operator/broadcasts${tab ? `?status=${tab}` : ''}`,
  )

  return (
    <>
      <PageHeader
        title="推播審核"
        action={
          <Link to="/operator/broadcasts/new" className="btn-primary text-sm">
            廠商自發
          </Link>
        }
      />

      <div className="mb-3 flex gap-1 overflow-x-auto px-4 text-sm">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${
              tab === t.value ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? <EmptyState title="沒有符合的推播" /> : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {data.items.map((b) => (
            <li key={b.id}>
              <Link
                to={`/operator/broadcasts/${b.id}`}
                className="card block p-4 active:bg-neutral-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">
                      {b.title || '（未填標題）'}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {b.stall?.name ?? '廠商自發'}・{COMPOSE_LABEL[b.composeMode]}
                    </p>
                  </div>
                  <StatusBadge
                    status={b.status}
                    label={broadcastStatusLabel[b.status] ?? b.status}
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                  {b.bodyText || '（尚未填寫內容）'}
                </p>
                <p className="mt-1.5 text-xs text-neutral-400">
                  {formatTaipeiDateTime(b.createdAt)}
                  {b.marketDay ? `・${b.marketDay.eventDate}` : ''}
                  {b.recipientCount != null ? `・送給 ${b.recipientCount} 人` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
