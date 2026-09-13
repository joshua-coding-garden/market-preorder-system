import { Link, Outlet } from 'react-router-dom'
import AuthMenu from '@/components/AuthMenu'
import { useSession } from '@/store/session'

/** 攤商 View 外框（05 §攤商 View） */
export default function StallLayout() {
  const { me } = useSession()

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-neutral-50">
      <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Link to="/stall" className="text-base font-bold text-brand-600">
            攤商專區
          </Link>
          <AuthMenu />
        </div>
        {me && me.stalls.length > 0 ? (
          <p className="mt-1 text-xs text-neutral-500">
            {me.stalls.map((s) => s.name).join('、')}
          </p>
        ) : null}
      </div>

      <main className="flex-1 pb-16">
        <Outlet />
      </main>
    </div>
  )
}
