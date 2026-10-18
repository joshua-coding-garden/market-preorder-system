import { useCallback, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import type { ListingStatus, MarketDayDetail } from '@market/shared'
import { ApiError, api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  BackLink,
  EmptyState,
  ErrorState,
  MoneyTWD,
  Spinner,
  deadlineCountdown,
  formatTaipeiDate,
  formatTaipeiDateTime,
} from '@/components/common'
import { Toast, inputClass } from '@/components/form'
import { HowItWorksSheet } from '@/components/HowItWorks'
import { Icon } from '@/components/icons'
import { useSession } from '@/store/session'
import type { CartData } from '@/api/cartTypes'
import { MarketBadge } from './MarketHome'

export interface PublicListing {
  listingId: string
  productId: string
  code: string
  name: string
  description: string | null
  imageUrl: string | null
  thumbUrl: string | null
  price: number
  maxQty: number | null
  status: ListingStatus
  stall: { id: string; name: string; boothNo: string }
  components: { id: string; name: string; extraPrice: number; allowCustomNote: boolean }[]
}

/** 商品彈窗（巢狀路由）加入購物車後，通知底下的場次頁更新購物車並顯示提示 */
export interface DayOutletContext {
  onAdded: (message: string) => void
}

/**
 * 場次頁與攤商頁共用：提示訊息、購物車件數、商品卡「＋」快速加入。
 * ⚠️ 規格外（2026-10-18，參考 OnlineMenu）：沒有內容物可選的商品按「＋」直接加入，
 * 有內容物的照舊打開商品彈窗讓顧客挑。
 */
export function useDayShopping(dayId: string) {
  const { me } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const cart = useApi<CartData>(me ? `/cart?marketDayId=${dayId}` : null)
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 1500)
  }, [])

  const reloadCart = cart.reload
  const onAdded = useCallback(
    (message: string) => {
      flash(message)
      reloadCart()
    },
    [flash, reloadCart],
  )

  const quickAdd = async (listing: PublicListing) => {
    if (!me) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    try {
      await api.post('/cart/items', {
        marketDayId: dayId,
        listingId: listing.listingId,
        qty: 1,
        components: [],
      })
      onAdded(`已加入：${listing.name}`)
    } catch (err) {
      flash(err instanceof ApiError ? toMessage(err) : '加入失敗，請稍後再試')
    }
  }

  const outletContext: DayOutletContext = { onAdded }
  return { cart: cart.data, toast, quickAdd, outletContext }
}

/** C2 場次頁：場次資訊、攤商 chips、商品格狀列表、搜尋 */
export default function MarketDayPage() {
  const { dayId = '' } = useParams()
  const day = useApi<MarketDayDetail>(`/market-days/${dayId}`)
  const listings = useApi<{ items: PublicListing[] }>(`/market-days/${dayId}/listings`)
  const { cart, toast, quickAdd, outletContext } = useDayShopping(dayId)

  const [stallFilter, setStallFilter] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const items = listings.data?.items ?? []
    const keyword = q.trim().toLowerCase()
    return items.filter(
      (l) =>
        (!stallFilter || l.stall.id === stallFilter) &&
        (!keyword ||
          l.name.toLowerCase().includes(keyword) ||
          l.code.toLowerCase().includes(keyword)),
    )
  }, [listings.data, stallFilter, q])

  if (day.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={day.reload} />
  if (!day.data) return null

  const d = day.data

  return (
    <>
      {/* ⚠️ 規格外（2026-10-18，參考 OnlineMenu）：上方做成店面招牌 */}
      <div className="px-4">
        <BackLink to={`/markets/${d.market.id}`} label={`${d.market.name}・所有場次`} />
      </div>
      <section className="flex flex-col items-center gap-1 px-4 pb-4 text-center">
        <MarketBadge name={d.market.name} size="lg" />
        <h1 className="mt-1 text-2xl font-bold text-orange-900">{d.market.name}</h1>
        <p className="text-[15px] font-medium tabular-nums">
          {formatTaipeiDate(d.eventDate)}・{d.openTime}–{d.closeTime}
        </p>
        <p className="text-sm text-neutral-500">
          {d.market.location}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.market.location)}`}
            target="_blank"
            rel="noreferrer"
            className="ml-2 text-neutral-600 underline"
          >
            導航
          </a>
        </p>
        <p className="mt-1 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          {new Date(d.orderDeadline) <= new Date()
            ? '預購已截止'
            : `${deadlineCountdown(d.orderDeadline)}・${formatTaipeiDateTime(d.orderDeadline)} 截止`}
        </p>
      </section>

      {d.locationNote ? (
        <section className="mx-4 mb-3 rounded-2xl border border-brand-100 bg-white px-4 py-3">
          <h2 className="text-sm font-bold">公告</h2>
          <p className="mt-0.5 text-sm text-neutral-700">{d.locationNote}</p>
        </section>
      ) : null}

      <div className="sticky top-0 z-10 bg-neutral-50/95 backdrop-blur">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 text-sm">
          <button
            type="button"
            onClick={() => setStallFilter(null)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 ${
              stallFilter === null
                ? 'bg-brand-500 font-medium text-white'
                : 'border border-neutral-200 bg-white text-neutral-700'
            }`}
          >
            全部攤商
          </button>
          {d.participations.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStallFilter(p.stall.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 ${
                stallFilter === p.stall.id
                  ? 'bg-brand-500 font-medium text-white'
                  : 'border border-neutral-200 bg-white text-neutral-700'
              }`}
            >
              {p.stall.name}
              <span className="ml-1 opacity-70">{p.boothNo}</span>
            </button>
          ))}
        </div>
        <div className="px-4 pb-2.5">
          <input
            className={inputClass}
            placeholder="搜尋商品"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
          />
        </div>
      </div>

      {listings.loading ? <Spinner /> : null}
      {listings.error ? (
        <ErrorState message={listings.error} onRetry={listings.reload} />
      ) : null}
      {listings.data && filtered.length === 0 ? (
        <EmptyState title="沒有符合的商品" hint={q ? '換個關鍵字試試' : '攤商還沒上架商品'} />
      ) : null}

      {filtered.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 px-4 pb-44 pt-2">
          {filtered.map((l) => (
            <li key={l.listingId}>
              <ProductCard
                listing={l}
                to={`/days/${dayId}/products/${l.listingId}`}
                onQuickAdd={quickAdd}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <DayFab dayId={dayId} cart={cart} />
      <Toast message={toast} position="top" />
      <Outlet context={outletContext} />
    </>
  )
}

export function ProductCard({
  listing,
  to,
  onQuickAdd,
}: {
  listing: PublicListing
  to: string
  onQuickAdd: (listing: PublicListing) => void
}) {
  const soldOut = listing.status === 'SOLD_OUT'
  const plusClass =
    'absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-brand-500 bg-white text-xl leading-none text-brand-500 shadow-sm active:bg-brand-50'

  return (
    <div className={`relative ${soldOut ? 'opacity-60' : ''}`}>
      <Link
        to={to}
        className="block rounded-[20px] border border-neutral-200 bg-white p-2.5 active:bg-neutral-50"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-100">
          {listing.thumbUrl ? (
            <img src={listing.thumbUrl} alt={listing.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">
              無圖片
            </div>
          )}
          {soldOut ? (
            <span className="absolute left-2 top-2 rounded-full bg-neutral-900/80 px-2 py-0.5 text-xs text-white">
              已售完
            </span>
          ) : null}
        </div>
        <p className="mt-2 truncate px-0.5 text-[15px] font-medium">{listing.name}</p>
        <p className="truncate px-0.5 text-xs text-neutral-500">
          {listing.stall.name}・{listing.stall.boothNo}
        </p>
        <p className="mt-0.5 px-0.5 text-base font-bold text-brand-700">
          <MoneyTWD value={listing.price} />
        </p>
      </Link>

      {/* 「＋」不能包在 <a> 裡（互動元素不能巢狀），所以疊在卡片上面 */}
      {soldOut ? null : listing.components.length > 0 ? (
        <Link to={to} aria-label={`選擇 ${listing.name} 的內容物`} className={plusClass}>
          +
        </Link>
      ) : (
        <button
          type="button"
          aria-label={`把 ${listing.name} 加入購物車`}
          className={plusClass}
          onClick={() => onQuickAdd(listing)}
        >
          +
        </button>
      )}
    </div>
  )
}

/**
 * ⚠️ 規格外（2026-10-18，參考 OnlineMenu）：右下角固定的浮動按鈕，取代原本底部的購物車列。
 * 購物車那一格仍顯示件數與金額。
 */
export function DayFab({ dayId, cart }: { dayId: string; cart: CartData | null }) {
  const [howOpen, setHowOpen] = useState(false)
  const count = cart?.itemCount ?? 0
  const row = 'flex min-h-[50px] items-center gap-2.5 px-4 text-[15px]'

  return (
    <>
      {/* 外框最寬 640px 置中，按鈕要貼著外框右緣而不是視窗右緣 */}
      <div className="fixed bottom-4 right-[max(0.75rem,calc(50vw_-_320px_+_0.75rem))] z-20 flex w-44 flex-col overflow-hidden rounded-[20px] border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
        <Link
          to={`/days/${dayId}/cart`}
          className={`${row} border-b border-neutral-100 font-medium text-brand-700 active:bg-neutral-50`}
        >
          <Icon name="cart" size={20} strokeWidth={1.9} />
          <span className="flex-1">
            購物車
            {count > 0 && cart ? (
              <span className="block text-xs font-normal text-neutral-500">
                <MoneyTWD value={cart.total} />
              </span>
            ) : null}
          </span>
          {count > 0 ? (
            <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white tabular-nums">
              {count}
            </span>
          ) : null}
        </Link>
        <Link
          to="/orders"
          className={`${row} border-b border-neutral-100 text-neutral-700 active:bg-neutral-50`}
        >
          <Icon name="receipt" size={20} strokeWidth={1.9} />
          我的訂單
        </Link>
        <button
          type="button"
          onClick={() => setHowOpen(true)}
          className={`${row} text-left text-neutral-700 active:bg-neutral-50`}
        >
          <Icon name="help" size={20} strokeWidth={1.9} />
          怎麼預購
        </button>
      </div>
      {howOpen ? <HowItWorksSheet onClose={() => setHowOpen(false)} /> : null}
    </>
  )
}
