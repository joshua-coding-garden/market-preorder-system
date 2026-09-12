import { Link, NavLink, Outlet } from 'react-router-dom'
import ImpersonatePicker from '@/components/ImpersonatePicker'
import { useSession } from '@/store/session'

const NAV = [
  { to: '/operator', label: '儀表板', end: true },
  { to: '/operator/days', label: '場次' },
  { to: '/operator/stalls', label: '攤商' },
  { to: '/operator/markets', label: '市集' },
  { to: '/operator/broadcasts', label: '推播' },
  { to: '/operator/permissions', label: '帳號與權限' },
]

/** 廠商 CMS 外框（05 §廠商 View） */
export default function OperatorLayout() {
  const { me } = useSession()

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-lg flex-col bg-neutral-50">
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link to="/operator" className="shrink-0 text-base font-bold text-brand-600">
            市集後台
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              僅管理員可見
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ImpersonatePicker variant="compact" selfId={me?.id} />
            <Link to="/" className="text-sm text-neutral-600">
              回顧客頁
            </Link>
          </div>
        </div>
        {/* 換行而不是橫向捲動，手機上最後一個分頁才不會被切掉 */}
        <nav className="flex flex-wrap gap-1 px-2 pb-2 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 ${
                  isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-600'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
