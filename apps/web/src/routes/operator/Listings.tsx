import { useCallback, useEffect, useState } from 'react'
import type { ListingStatus } from '@market/shared'
import { api } from '@/api/client'
import { toMessage } from '@/api/useApi'
import {
  EmptyState,
  ErrorState,
  MoneyTWD,
  PageHeader,
  Spinner,
  formatTaipeiDate,
} from '@/components/common'
import { FormError, StatusBadge } from '@/components/form'
import Sheet from '@/components/Sheet'
import { listingApprovalLabel } from '@/i18n/zh-TW'

type Approval = 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED'

interface OperatorListing {
  id: string
  price: number
  maxQty: number | null
  status: ListingStatus
  approval: Approval
  rejectReason: string | null
  product: {
    id: string
    code: string
    name: string
    thumbUrl: string | null
    description: string | null
  }
  stall: { id: string; name: string }
  marketDay: { id: string; eventDate: string; status: string }
}

const TABS: { value: Approval | 'ALL'; label: string }[] = [
  { value: 'PENDING_REVIEW', label: '待審核' },
  { value: 'REJECTED', label: '已退回' },
  { value: 'APPROVED', label: '已通過' },
  { value: 'ALL', label: '全部' },
]

const STATUS_LABEL: Record<string, string> = {
  ON_SALE: '販售中',
  SOLD_OUT: '已售完',
  OFF_SHELF: '已下架',
}

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：商品審核與強制上／下架。
 *
 * 一頁同時處理「審核佇列」與「所有上架的商品」——它們是同一批資料，
 * 分兩頁只會讓人不知道該去哪一頁找。
 */
export default function OperatorListings() {
  const [tab, setTab] = useState<Approval | 'ALL'>('PENDING_REVIEW')
  const [items, setItems] = useState<OperatorListing[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<OperatorListing | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = tab === 'ALL' ? '' : `?approval=${tab}`
      setItems((await api.get<{ items: OperatorListing[] }>(`/operator/listings${qs}`)).items)
    } catch (err) {
      setError(toMessage(err))
    }
  }, [tab])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  const run = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(id)
    setActionError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setActionError(toMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="商品與審核" subtitle="通過、退回，或直接強制上／下架" />

      <div className="mb-3 flex flex-wrap gap-1 px-4 text-sm">
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

      <div className="px-4">
        <FormError message={actionError} />
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!items && !error ? <Spinner /> : null}
      {items && items.length === 0 ? (
        <EmptyState
          title={tab === 'PENDING_REVIEW' ? '沒有待審核的商品' : '這裡沒有資料'}
          hint={
            tab === 'PENDING_REVIEW'
              ? '攤商送出上架後會出現在這裡（需先在系統設定開啟審核）'
              : undefined
          }
        />
      ) : null}

      {items && items.length > 0 ? (
        <ul className="space-y-3 px-4 pb-10">
          {items.map((l) => (
            <li key={l.id} className="card p-3">
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  {l.product.thumbUrl ? (
                    <img
                      src={l.product.thumbUrl}
                      alt={l.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">
                      無圖片
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-base font-semibold">{l.product.name}</p>
                    <StatusBadge status={l.approval} label={listingApprovalLabel[l.approval]} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {l.stall.name}・{formatTaipeiDate(l.marketDay.eventDate)}
                  </p>
                  <p className="mt-1 text-sm text-neutral-700">
                    <MoneyTWD value={l.price} />
                    <span className="ml-2 text-xs text-neutral-500">
                      上限 {l.maxQty ?? '不限'}・{STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </p>
                </div>
              </div>

              {l.product.description ? (
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-neutral-600">
                  {l.product.description}
                </p>
              ) : null}

              {l.approval === 'REJECTED' && l.rejectReason ? (
                <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">
                  退回理由：{l.rejectReason}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {l.approval !== 'APPROVED' ? (
                  <button
                    type="button"
                    className="rounded-lg bg-brand-500 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                    disabled={busy === l.id}
                    onClick={() =>
                      void run(l.id, () => api.post(`/operator/listings/${l.id}/approve`))
                    }
                  >
                    通過
                  </button>
                ) : null}

                {l.approval !== 'REJECTED' ? (
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-red-600 disabled:opacity-50"
                    disabled={busy === l.id}
                    onClick={() => setRejecting(l)}
                  >
                    退回
                  </button>
                ) : null}

                {l.status === 'OFF_SHELF' ? (
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-50"
                    disabled={busy === l.id}
                    onClick={() =>
                      void run(l.id, () =>
                        api.patch(`/operator/listings/${l.id}`, { status: 'ON_SALE' }),
                      )
                    }
                  >
                    強制上架
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 disabled:opacity-50"
                    disabled={busy === l.id}
                    onClick={() =>
                      void run(l.id, () =>
                        api.patch(`/operator/listings/${l.id}`, { status: 'OFF_SHELF' }),
                      )
                    }
                  >
                    強制下架
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {rejecting ? (
        <RejectSheet
          listing={rejecting}
          onClose={() => setRejecting(null)}
          onDone={async (reason) => {
            const target = rejecting
            setRejecting(null)
            await run(target.id, () =>
              api.post(`/operator/listings/${target.id}/reject`, { reason }),
            )
          }}
        />
      ) : null}
    </>
  )
}

function RejectSheet({
  listing,
  onClose,
  onDone,
}: {
  listing: OperatorListing
  onClose: () => void
  onDone: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Sheet title="退回這筆上架" onClose={onClose}>
      <p className="rounded-xl bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
        {listing.stall.name}・{listing.product.name}
        <br />
        退回理由會顯示在攤商的「本場上架」頁，他修改後會重新送審。
      </p>

      <textarea
        className="mt-3 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-base"
        rows={3}
        maxLength={200}
        autoFocus
        placeholder="例：照片看不出是什麼商品，請換一張"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />

      <button
        type="button"
        className="btn-primary mt-3 w-full"
        disabled={busy || reason.trim().length === 0}
        onClick={() => {
          setBusy(true)
          void onDone(reason.trim())
        }}
      >
        {busy ? '送出中…' : '確定退回'}
      </button>
    </Sheet>
  )
}
