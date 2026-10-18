import { NavLink } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { formatTaipeiDate } from '@/components/common'
import { DAY_SECTIONS, type StallDayRow } from './StallHome'

/**
 * ⚠️ 規格外（2026-10-18 指示）：場次子頁（上架／訂單／備貨／核銷）上方的場次資訊與頁籤，
 * 四頁之間直接切換，不用先回我的場次。
 */
export default function DayTabs({ stallId, dayId }: { stallId: string; dayId: string }) {
  const { data } = useApi<{ items: StallDayRow[] }>(`/stalls/${stallId}/market-days`)
  const row = data?.items.find((r) => r.marketDay.id === dayId)

  return (
    <div>
      {row ? (
        <p className="pb-2 text-sm text-neutral-700">
          {formatTaipeiDate(row.marketDay.eventDate)}・{row.marketDay.market.name}・攤位{' '}
          {row.boothNo}
        </p>
      ) : null}
      <nav aria-label="場次功能" className="grid grid-cols-4 gap-1 rounded-xl bg-neutral-200/70 p-1 text-sm">
        {DAY_SECTIONS.map((s) => (
          <NavLink
            key={s.path}
            to={`/stall/${stallId}/days/${dayId}/${s.path}`}
            className={({ isActive }) =>
              `flex min-h-10 items-center justify-center rounded-lg ${
                isActive ? 'bg-white font-bold text-brand-700 shadow-sm' : 'text-neutral-600'
              }`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
