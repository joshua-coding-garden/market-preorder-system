import { Link, NavLink, Outlet } from 'react-router-dom'

const NAV = [
  { to: '/operator', label: '儀表板', end: true },
  { to: '/operator/days', label: '場次' },
  { to: '/operator/stalls', label: '攤商' },
  { to: '/operator/markets', label: '市集' },
  { to: '/operator/broadcasts', label: '推播' },
]

/** 廠商 CMS 外框（05 §廠商 View） */
export default function OperatorLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-lg flex-col bg-neutral-50">
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/operator" className="text-base font-bold text-brand-600">
            市集後台
          </Link>
          <Link to="/" className="text-sm text-neutral-600">
            回顧客頁
          </Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm">
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
