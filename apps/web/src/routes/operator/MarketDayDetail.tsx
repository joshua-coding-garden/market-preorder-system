import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MarketDayDetail as DayDetail } from '@market/shared'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  ErrorState,
  PageHeader,
  Spinner,
  formatTaipeiDate,
  formatTaipeiDateTime,
} from '@/components/common'
import { Field, FormError, StatusBadge, Toast, inputClass } from '@/components/form'
import { marketDayStatusLabel } from '@/i18n/zh-TW'

interface ParticipationRow {
  id: string
  boothNo: string
  stall: { id: string; name: string }
  memberCount: number
  inviteCode: {
    id: string
    code: string
    status: string
    expiresAt: string
    redeemedAt: string | null
  } | null
}

interface StallItem {
  id: string
  name: string
  isActive: boolean
}

const inviteStatusLabel: Record<string, string> = {
  ACTIVE: '可使用',
  REDEEMED: '已綁定',
  EXPIRED: '已失效',
  RECYCLED: '已回收',
}

/** O4 場次詳情：參與攤商表、邀請碼、發布／結案 */
export default function MarketDayDetail() {
  const { id = '' } = useParams()
  const day = useApi<DayDetail>(`/market-days/${id}`)
  const parts = useApi<{ items: ParticipationRow[] }>(
    `/operator/market-days/${id}/participations`,
  )
  const stalls = useApi<{ items: StallItem[] }>('/operator/stalls')

  const [toast, setToast] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ stallId: '', boothNo: '' })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const reloadAll = () => {
    day.reload()
    parts.reload()
  }

  const run = async (fn: () => Promise<unknown>, okMessage: string) => {
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      showToast(okMessage)
      reloadAll()
    } catch (err) {
      setActionError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const addParticipation = async (e: React.FormEvent) => {
    e.preventDefault()
    const stallId = addForm.stallId || stalls.data?.items[0]?.id
    if (!stallId) return
    await run(async () => {
      await api.post(`/operator/market-days/${id}/participations`, {
        stallId,
        boothNo: addForm.boothNo,
      })
      setAddForm({ stallId: '', boothNo: '' })
      setAddOpen(false)
    }, '已加入攤商並產生邀請碼')
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      showToast(`已複製 ${code}`)
    } catch {
      showToast('複製失敗，請手動選取')
    }
  }

  const close = async () => {
    const pending = window.confirm(
      '結案後這個場次的訂單與上架都會變成唯讀，未取貨的訂單會標記為「未取」。確定要結案嗎？',
    )
    if (!pending) return
    await run(async () => {
      const res = await api.post<{ noShowCount: number }>(
        `/operator/market-days/${id}/close`,
      )
      showToast(`已結案，${res.noShowCount} 筆標記為未取`)
    }, '已結案')
  }

  if (day.loading || parts.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={reloadAll} />
  if (!day.data) return null

  const d = day.data
  const rows = parts.data?.items ?? []
  const isClosed = d.status === 'CLOSED'

  return (
    <>
      <PageHeader
        title={formatTaipeiDate(d.eventDate)}
        subtitle={`${d.market.code}｜${d.market.name}・${d.market.location}`}
        action={<StatusBadge status={d.status} label={marketDayStatusLabel[d.status]} />}
      />

      <section className="card mx-4 mb-4 p-4 text-sm">
        <dl className="space-y-1.5 text-neutral-700">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-neutral-400">營業時間</dt>
            <dd className="tabular-nums">
              {d.openTime}–{d.closeTime}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-neutral-400">預購截止</dt>
            <dd>{formatTaipeiDateTime(d.orderDeadline)}</dd>
          </div>
          {d.locationNote ? (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 text-neutral-400">地點備註</dt>
              <dd>{d.locationNote}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          {d.status === 'DRAFT' ? (
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={busy}
              onClick={() =>
                run(() => api.post(`/operator/market-days/${id}/publish`), '已發布')
              }
            >
              發布
            </button>
          ) : null}
          {d.status === 'PUBLISHED' ? (
            <>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/operator/market-days/${id}/unpublish`), '已取消發布')
                }
              >
                取消發布
              </button>
              <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={close}>
                結案
              </button>
            </>
          ) : null}
        </div>

        <FormError message={actionError} />
      </section>

      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-base font-semibold">參與攤商（{rows.length}）</h2>
        {!isClosed ? (
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? '取消' : '加入攤商'}
          </button>
        ) : null}
      </div>

      {addOpen ? (
        <form onSubmit={addParticipation} className="card mx-4 mb-4 space-y-3 p-4">
          <Field label="攤商" required>
            <select
              className={inputClass}
              value={addForm.stallId || stalls.data?.items[0]?.id || ''}
              onChange={(e) => setAddForm({ ...addForm, stallId: e.target.value })}
            >
              {stalls.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="攤位號" required hint="同一個場次不能重複">
            <input
              className={inputClass}
              value={addForm.boothNo}
              onChange={(e) => setAddForm({ ...addForm, boothNo: e.target.value.toUpperCase() })}
              placeholder="B03"
              required
            />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            加入並產生邀請碼
          </button>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="px-4 pb-6 text-sm text-neutral-500">
          還沒有攤商。場次至少要有一個攤商才能發布。
        </p>
      ) : (
        <ul className="space-y-3 px-4 pb-8">
          {rows.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold">{p.stall.name}</p>
                  <p className="mt-0.5 text-sm text-neutral-600">
                    攤位 {p.boothNo}・{p.memberCount} 位成員
                  </p>
                </div>
                {p.inviteCode ? (
                  <StatusBadge
                    status={p.inviteCode.status}
                    label={inviteStatusLabel[p.inviteCode.status] ?? p.inviteCode.status}
                  />
                ) : null}
              </div>

              {p.inviteCode ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-neutral-100 px-2.5 py-1.5 font-mono text-sm tracking-wide">
                    {p.inviteCode.code}
                  </code>
                  <button
                    type="button"
                    className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs"
                    onClick={() => copyCode(p.inviteCode!.code)}
                  >
                    複製
                  </button>
                  {!isClosed ? (
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api.post(`/operator/participations/${p.id}/invite-codes/reissue`),
                          '已重新發碼',
                        )
                      }
                    >
                      重發
                    </button>
                  ) : null}
                  {!isClosed && p.memberCount === 0 ? (
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600"
                      disabled={busy}
                      onClick={() =>
                        run(() => api.delete(`/operator/participations/${p.id}`), '已移除攤商')
                      }
                    >
                      移除
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* ⚠️ 規格外（2026-09-20 指示）：管理員直接指定這攤在本場要賣什麼 */}
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                <Link
                  to={`/stall/${p.stall.id}/days/${id}/listings`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  本場上架
                </Link>
                <Link
                  to={`/stall/${p.stall.id}/products`}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5"
                >
                  商品
                </Link>
              </div>

              <p className="mt-2 text-xs text-neutral-400">
                攤商在 LINE 輸入「邀請碼 {p.inviteCode?.code ?? 'XXXX'}」即可綁定
              </p>
            </li>
          ))}
        </ul>
      )}

      <Toast message={toast} />
    </>
  )
}
