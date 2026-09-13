import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { SubOrderStatus } from '@market/shared'
import { api } from '@/api/client'
import { useStallSocket } from '@/api/socket'
import { EmptyState, ErrorState, MoneyTWD, PageHeader, Spinner } from '@/components/common'
import { StatusBadge } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'

export interface StallSubOrder {
  id: string
  boothNo: string
  pickupCode: string
  status: SubOrderStatus
  subtotal: number
  pickedUpAt: string | null
  createdAt: string
  contactName: string
  contactPhone: string
  pickupAt: string
  note: string | null
  itemCount: number
  items: {
    productCode: string
    productName: string
    unitPrice: number
    qty: number
    lineTotal: number
    customNote: string | null
    components: { name: string; extraPrice: number }[]
  }[]
}

const TABS: { value: SubOrderStatus; label: string }[] = [
  { value: 'PENDING', label: '待取貨' },
  { value: 'PICKED_UP', label: '已取貨' },
  { value: 'NO_SHOW', label: '未取' },
  { value: 'CANCELLED', label: '取消' },
]

/** 備援 polling 間隔（D-08：socket 斷線時靠這個補） */
const POLL_INTERVAL_MS = 60_000

/** S6 訂單列表（即時） */
export default function SubOrders() {
  const { stallId = '', dayId = '' } = useParams()
  const [tab, setTab] = useState<SubOrderStatus>('PENDING')
  const [items, setItems] = useState<StallSubOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const tabRef = useRef(tab)
  tabRef.current = tab

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: StallSubOrder[] }>(
        `/stalls/${stallId}/market-days/${dayId}/sub-orders?status=${tabRef.current}`,
      )
      setItems(res.items)
      setLastSync(new Date())
      setError(null)
    } catch {
      setError('讀取訂單失敗')
    }
  }, [stallId, dayId])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load, tab])

  // 60 秒 polling 備援（D-08）
  useEffect(() => {
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [load])

  const { connected } = useStallSocket(stallId, {
    onOrderNew: (e) => {
      // 新單插到頂部並閃一下
      setFlashIds((prev) => new Set(prev).add(e.subOrderId))
      setTimeout(() => {
        setFlashIds((prev) => {
          const next = new Set(prev)
          next.delete(e.subOrderId)
          return next
        })
      }, 3000)
      void load()
    },
    onOrderStatus: () => void load(),
  })

  return (
    <>
      <PageHeader
        title="訂單"
        subtitle={
          lastSync
            ? `最後更新 ${lastSync.toLocaleTimeString('zh-TW', { hour12: false })}`
            : undefined
        }
        action={
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
              connected ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? 'bg-green-500' : 'bg-neutral-400'
              }`}
            />
            {connected ? '即時連線中' : '離線・每分鐘更新'}
          </span>
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

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!items && !error ? <Spinner /> : null}
      {items && items.length === 0 ? <EmptyState title="沒有這個狀態的訂單" /> : null}

      {items && items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-8">
          {items.map((so) => (
            <li key={so.id}>
              <Link
                to={`/stall/${stallId}/sub-orders/${so.id}`}
                className={`card block p-4 transition active:bg-neutral-50 ${
                  flashIds.has(so.id) ? 'animate-pulse ring-2 ring-brand-400' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-2xl font-bold tracking-wide">
                      {so.pickupCode}
                    </p>
                    <p className="mt-1 text-sm text-neutral-700">
                      {so.contactName}・取貨 <span className="tabular-nums">{so.pickupAt}</span>
                    </p>
                  </div>
                  <StatusBadge status={so.status} label={subOrderStatusLabel[so.status]} />
                </div>

                <p className="mt-2 truncate text-sm text-neutral-600">
                  {so.items
                    .map((i) => `${i.productName}×${i.qty}`)
                    .join('、')}
                </p>
                <p className="mt-1 text-right text-sm font-semibold">
                  <MoneyTWD value={so.subtotal} />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
