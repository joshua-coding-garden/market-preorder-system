import { Link, useParams } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { EmptyState, ErrorState, MoneyTWD, PageHeader, Spinner } from '@/components/common'

interface ProductRow {
  id: string
  code: string
  name: string
  thumbUrl: string | null
  basePrice: number
  isActive: boolean
  components: { id: string }[]
}

/** S3 商品管理 */
export default function Products() {
  const { stallId = '' } = useParams()
  const { data, loading, error, reload } = useApi<{ items: ProductRow[] }>(
    `/stalls/${stallId}/products?includeInactive=true`,
  )

  return (
    <>
      <PageHeader
        title="商品管理"
        subtitle="商品跨場次共用；每場的售價與上限在「本場上架」設定"
        action={
          <Link to={`/stall/${stallId}/products/new`} className="btn-primary text-sm">
            新增商品
          </Link>
        }
      />

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="還沒有商品" hint="先建立商品，才能在場次上架" />
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {data.items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/stall/${stallId}/products/${p.id}`}
                className="card flex items-center gap-3 p-3 active:bg-neutral-50"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  {p.thumbUrl ? (
                    <img src={p.thumbUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                      無圖片
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-base font-semibold">{p.name}</span>
                    {!p.isActive ? (
                      <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] text-neutral-600">
                        已停用
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-neutral-500">{p.code}</p>
                  <p className="mt-1 text-sm text-neutral-700">
                    <MoneyTWD value={p.basePrice} />
                    {p.components.length > 0 ? (
                      <span className="ml-2 text-neutral-500">內容物 {p.components.length}</span>
                    ) : null}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
