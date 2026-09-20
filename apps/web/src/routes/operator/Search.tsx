import { Link, useSearchParams } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { EmptyState, ErrorState, MoneyTWD, PageHeader, Spinner } from '@/components/common'
import { inputClass } from '@/components/form'

interface StallRow {
  id: string
  name: string
  contactName: string | null
  contactPhone: string | null
  isActive: boolean
  markets: { id: string; name: string }[]
}

interface ProductRow {
  id: string
  code: string
  name: string
  basePrice: number
  isActive: boolean
  stall: { id: string; name: string }
}

interface MarketItem {
  id: string
  name: string
  isActive: boolean
}

type Tab = 'stalls' | 'products'

const TABS: { value: Tab; label: string }[] = [
  { value: 'stalls', label: '攤商' },
  { value: 'products', label: '商品' },
]

/** 「狀態」在兩個頁籤意思不同：攤商是帳號啟用，商品是上架 */
const ACTIVE_OPTIONS: Record<Tab, { value: string; label: string }[]> = {
  stalls: [
    { value: '', label: '全部狀態' },
    { value: 'true', label: '啟用中' },
    { value: 'false', label: '已停用' },
  ],
  products: [
    { value: '', label: '全部狀態' },
    { value: 'true', label: '上架' },
    { value: 'false', label: '下架' },
  ],
}

const selectClass = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm'

function qs(params: Record<string, string>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const s = query.toString()
  return s ? `?${s}` : ''
}

/**
 * O9 搜尋（規格外）：攤商／商品兩個頁籤。
 * 篩選條件全部放在網址的 query string，攤商列的「全部商品」才能直接用連結切到商品頁籤。
 */
export default function Search() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'products' ? 'products' : 'stalls'
  const q = params.get('q') ?? ''
  const marketId = params.get('marketId') ?? ''
  const stallId = params.get('stallId') ?? ''
  const isActive = params.get('isActive') ?? ''

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const switchTab = (next: Tab) => {
    if (next !== tab) setParams({ tab: next }, { replace: true })
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = new FormData(e.currentTarget).get('q')
    update({ q: typeof value === 'string' ? value.trim() : '' })
  }

  const markets = useApi<{ items: MarketItem[] }>('/operator/markets')
  const stallOptions = useApi<{ items: StallRow[] }>(tab === 'products' ? '/operator/stalls' : null)
  const stalls = useApi<{ items: StallRow[] }>(
    tab === 'stalls' ? `/operator/stalls${qs({ q, marketId, isActive })}` : null,
  )
  const products = useApi<{ items: ProductRow[]; truncated: boolean }>(
    tab === 'products' ? `/operator/products${qs({ q, marketId, stallId, isActive })}` : null,
  )

  return (
    <>
      <PageHeader title="搜尋" subtitle="找攤商或商品" />

      <div className="space-y-2 px-4 pb-3">
        <div className="flex gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => switchTab(t.value)}
              className={`rounded-lg px-3 py-1.5 ${
                tab === t.value ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex gap-2">
          <input
            key={`${tab}-${q}`}
            name="q"
            type="search"
            defaultValue={q}
            placeholder={tab === 'stalls' ? '攤商名稱或聯絡人' : '商品名稱或代碼'}
            className={inputClass}
          />
          <button type="submit" className="btn-secondary shrink-0 text-sm">
            搜尋
          </button>
        </form>

        <div className={`grid gap-2 ${tab === 'products' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <select
            className={selectClass}
            value={marketId}
            onChange={(e) => update({ marketId: e.target.value })}
          >
            <option value="">全部市集</option>
            {markets.data?.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.isActive ? '' : '（已停用）'}
              </option>
            ))}
          </select>

          {tab === 'products' ? (
            <select
              className={selectClass}
              value={stallId}
              onChange={(e) => update({ stallId: e.target.value })}
            >
              <option value="">全部攤商</option>
              {stallOptions.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.isActive ? '' : '（已停用）'}
                </option>
              ))}
            </select>
          ) : null}

          <select
            className={selectClass}
            value={isActive}
            onChange={(e) => update({ isActive: e.target.value })}
          >
            {ACTIVE_OPTIONS[tab].map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab === 'stalls' ? (
        <>
          {stalls.loading ? <Spinner /> : null}
          {stalls.error ? <ErrorState message={stalls.error} onRetry={stalls.reload} /> : null}
          {stalls.data && stalls.data.items.length === 0 ? (
            <EmptyState title="沒有符合的攤商" />
          ) : null}
          {stalls.data && stalls.data.items.length > 0 ? (
            <ul className="space-y-3 px-4 pb-8">
              {stalls.data.items.map((s) => (
                <li key={s.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{s.name}</p>
                      {s.contactName || s.contactPhone ? (
                        <p className="mt-1 text-sm text-neutral-600">
                          {s.contactName}
                          {s.contactPhone ? `・${s.contactPhone}` : ''}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs text-neutral-400">
                        {s.markets.length === 0
                          ? '尚未參加任何市集'
                          : `市集：${s.markets.map((m) => m.name).join('、')}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs ${
                        s.isActive
                          ? 'border-neutral-300 text-neutral-600'
                          : 'border-amber-300 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {s.isActive ? '啟用中' : '已停用'}
                    </span>
                  </div>
                  <Link
                    to={`/operator/search?tab=products&stallId=${s.id}`}
                    className="mt-3 inline-block text-sm font-medium text-brand-600"
                  >
                    全部商品
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <>
          {products.loading ? <Spinner /> : null}
          {products.error ? (
            <ErrorState message={products.error} onRetry={products.reload} />
          ) : null}
          {products.data && products.data.items.length === 0 ? (
            <EmptyState title="沒有符合的商品" />
          ) : null}
          {products.data?.truncated ? (
            <p className="px-4 pb-2 text-xs text-amber-700">
              結果超過 200 筆，只顯示前 200 筆，請縮小條件
            </p>
          ) : null}
          {products.data && products.data.items.length > 0 ? (
            <ul className="space-y-2 px-4 pb-8">
              {products.data.items.map((p) => (
                <li key={p.id} className="card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span className="truncate text-base font-semibold">{p.name}</span>
                      {!p.isActive ? (
                        <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600">
                          已下架
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">{p.code}</p>
                    <p className="mt-1 text-sm text-neutral-600">{p.stall.name}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium text-neutral-800">
                    <MoneyTWD value={p.basePrice} />
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </>
  )
}
