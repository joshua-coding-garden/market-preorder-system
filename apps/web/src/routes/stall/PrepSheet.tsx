import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '@/api/useApi'
import { useStallSocket } from '@/api/socket'
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common'

interface PrepData {
  products: {
    productCode: string
    productName: string
    prepCount: number
    components: { name: string; prepCount: number }[]
  }[]
  updatedAt: string
}

/** S8 備貨總表：商品層 + 展開內容物層（D-07） */
export default function PrepSheet() {
  const { stallId = '', dayId = '' } = useParams()
  const { data, loading, error, reload } = useApi<PrepData>(
    `/stalls/${stallId}/market-days/${dayId}/prep-sheet`,
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 收到 prep:changed 自動重抓（03 §11）
  useStallSocket(stallId, { onPrepChanged: reload })

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  return (
    <>
      <PageHeader
        title="備貨總表"
        subtitle={`只計待取貨與已取貨・最後更新 ${new Date(data.updatedAt).toLocaleTimeString('zh-TW', { hour12: false })}`}
        action={
          <button type="button" className="btn-secondary text-sm" onClick={reload}>
            重新整理
          </button>
        }
      />

      {data.products.length === 0 ? (
        <EmptyState title="這個場次還沒有需要備貨的訂單" />
      ) : (
        <ul className="space-y-2 px-4 pb-8">
          {data.products.map((p) => {
            const open = expanded.has(p.productCode)
            const hasComponents = p.components.length > 0
            return (
              <li key={p.productCode} className="card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => hasComponents && toggle(p.productCode)}
                  aria-expanded={open}
                >
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium">{p.productName}</p>
                    <p className="font-mono text-xs text-neutral-500">{p.productCode}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums">{p.prepCount}</span>
                    {hasComponents ? (
                      <span className="text-neutral-400">{open ? '▲' : '▼'}</span>
                    ) : null}
                  </div>
                </button>

                {open && hasComponents ? (
                  <ul className="border-t border-neutral-100 bg-neutral-50">
                    {p.components.map((c) => (
                      <li
                        key={c.name}
                        className="flex items-center justify-between px-4 py-2 pl-8 text-sm"
                      >
                        <span className="text-neutral-700">{c.name}</span>
                        <span className="font-semibold tabular-nums">{c.prepCount}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
