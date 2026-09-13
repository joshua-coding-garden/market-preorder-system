import { Link, NavLink, Outlet } from 'react-router-dom'
import AuthMenu from '@/components/AuthMenu'
import { useSession } from '@/store/session'

/** 顧客 View 外框（05 §顧客 View） */
export default function CustomerLayout() {
  const { me } = useSession()

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-neutral-50">
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="text-base font-bold text-brand-600">
            市集預購
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <NavLink
              to="/orders"
              className={({ isActive }) =>
                isActive ? 'font-medium text-brand-600' : 'text-neutral-600'
              }
            >
              我的訂單
            </NavLink>
            <AuthMenu />
          </nav>
        </div>
      </div>

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      {me?.capabilities.stall || me?.capabilities.operator ? (
        <div className="border-t border-neutral-200 bg-white px-4 py-3 text-center text-sm">
          {me.capabilities.stall ? (
            <Link to="/stall" className="text-brand-600">
              攤商專區
            </Link>
          ) : null}
          {me.capabilities.stall && me.capabilities.operator ? (
            <span className="mx-2 text-neutral-300">|</span>
          ) : null}
          {me.capabilities.operator ? (
            <Link to="/operator" className="text-brand-600">
              廠商後台
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
