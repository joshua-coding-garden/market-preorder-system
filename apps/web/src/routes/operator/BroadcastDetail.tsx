import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { MarketDayListItem, Paged } from '@market/shared'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner, formatTaipeiDateTime } from '@/components/common'
import { Field, FormError, StatusBadge, Toast, inputClass } from '@/components/form'
import { broadcastStatusLabel } from '@/i18n/zh-TW'

interface Broadcast {
  id: string
  composeMode: string
  title: string
  bodyText: string
  imageUrl: string | null
  audience: string
  status: string
  rejectReason: string | null
  sentAt: string | null
  recipientCount: number | null
  error: string | null
  createdAt: string
  marketDayId: string | null
  stall: { id: string; name: string } | null
}

interface Estimate {
  recipients: number
  monthUsed: number
  monthQuota: number
  estimate: number
  allowed: boolean
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL_FRIENDS: '官方帳號所有好友',
  MARKET_DAY_CUSTOMERS: '該場次所有下單顧客',
  STALL_CUSTOMERS: '該場次向該攤下單的顧客',
}

const EDITABLE = ['DRAFT', 'PENDING_REVIEW', 'APPROVED']

/** O8 推播編輯與送出 */
export default function BroadcastDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const detail = useApi<Broadcast>(isNew ? null : `/operator/broadcasts/${id}`)
  const days = useApi<Paged<MarketDayListItem>>('/operator/market-days')
  const [estimate, setEstimate] = useState<Estimate | null>(null)

  const [form, setForm] = useState({
    title: '',
    bodyText: '',
    audience: 'ALL_FRIENDS',
    marketDayId: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!detail.data) return
    setForm({
      title: detail.data.title,
      bodyText: detail.data.bodyText,
      audience: detail.data.audience,
      marketDayId: detail.data.marketDayId ?? '',
    })
  }, [detail.data])

  // send 前必呼叫 estimate（04 §E）
  const loadEstimate = async () => {
    if (isNew) return
    try {
      setEstimate(await api.get<Estimate>(`/operator/broadcasts/${id}/estimate`))
    } catch (err) {
      setEstimate(null)
      setError(toMessage(err))
    }
  }

  // 內容或對象改變就重新估算；用 key 收斂成單一依賴，避免每次 render 都重跑
  const estimateKey = detail.data
    ? `${detail.data.id}:${detail.data.audience}:${detail.data.marketDayId ?? ''}`
    : null
  useEffect(() => {
    if (!estimateKey) return
    void api
      .get<Estimate>(`/operator/broadcasts/${id}/estimate`)
      .then(setEstimate)
      .catch(() => setEstimate(null))
  }, [estimateKey, id])

  const showToast = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2200)
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      showToast(ok)
      detail.reload()
      await loadEstimate()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const createSelf = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<Broadcast>('/operator/broadcasts', {
        composeMode: 'OPERATOR_COMPOSE',
        title: form.title,
        bodyText: form.bodyText,
        audience: form.audience,
        ...(form.marketDayId ? { marketDayId: form.marketDayId } : {}),
      })
      navigate(`/operator/broadcasts/${created.id}`, { replace: true })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(
      () =>
        api.patch(`/operator/broadcasts/${id}`, {
          title: form.title,
          bodyText: form.bodyText,
          audience: form.audience,
          marketDayId: form.marketDayId || null,
        }),
      '已儲存',
    )

  if (!isNew && detail.loading) return <Spinner />
  if (!isNew && detail.error) {
    return <ErrorState message={detail.error} onRetry={detail.reload} />
  }

  const b = detail.data
  const canEdit = isNew || (b != null && EDITABLE.includes(b.status))
  const preview = form.title ? `${form.title}\n\n${form.bodyText}` : form.bodyText

  return (
    <>
      <PageHeader
        title={isNew ? '廠商自發推播' : '推播內容'}
        subtitle={b?.stall ? `來自 ${b.stall.name}` : isNew ? undefined : '廠商自發'}
        action={
          b ? (
            <StatusBadge status={b.status} label={broadcastStatusLabel[b.status] ?? b.status} />
          ) : null
        }
      />

      <form onSubmit={isNew ? createSelf : (e) => e.preventDefault()} className="space-y-4 px-4 pb-10">
        <FormError message={error} />

        {b?.status === 'REJECTED' && b.rejectReason ? (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            已退回：{b.rejectReason}
          </p>
        ) : null}
        {b?.status === 'SENT' ? (
          <p className="rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-800">
            已於 {b.sentAt ? formatTaipeiDateTime(b.sentAt) : ''} 送給 {b.recipientCount ?? 0} 人
          </p>
        ) : null}
        {b?.error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{b.error}</p>
        ) : null}

        <div className="card space-y-3 p-4">
          <Field label="標題">
            <input
              className={inputClass}
              value={form.title}
              maxLength={40}
              disabled={!canEdit || busy}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="內容" required>
            <textarea
              className={inputClass}
              rows={5}
              maxLength={500}
              value={form.bodyText}
              disabled={!canEdit || busy}
              onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
              required
            />
          </Field>
          <Field label="發送對象" required>
            <select
              className={inputClass}
              value={form.audience}
              disabled={!canEdit || busy}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            >
              {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {form.audience !== 'ALL_FRIENDS' ? (
            <Field label="關聯場次" required hint="這兩種對象需要指定場次">
              <select
                className={inputClass}
                value={form.marketDayId}
                disabled={!canEdit || busy}
                onChange={(e) => setForm({ ...form, marketDayId: e.target.value })}
              >
                <option value="">請選擇</option>
                {days.data?.items.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.eventDate}｜{d.market.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {!isNew && canEdit ? (
            <button type="button" className="btn-secondary w-full" disabled={busy} onClick={save}>
              儲存內容
            </button>
          ) : null}
        </div>

        <section className="card p-4">
          <h2 className="text-sm font-medium text-neutral-700">LINE 訊息預覽</h2>
          <div className="mt-2 rounded-2xl bg-[#8CABD8] p-3">
            <div className="max-w-[85%] rounded-2xl bg-white px-3 py-2 text-sm shadow">
              <p className="whitespace-pre-wrap break-words">{preview || '（尚未填寫內容）'}</p>
            </div>
          </div>
        </section>

        {isNew ? (
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            建立（直接核准）
          </button>
        ) : null}

        {!isNew && b ? (
          <>
            <section className="card p-4">
              <h2 className="text-sm font-medium text-neutral-700">估算</h2>
              {estimate ? (
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">預計收件人數</dt>
                    <dd className="font-semibold tabular-nums">{estimate.recipients}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">本次消耗則數</dt>
                    <dd className="tabular-nums">{estimate.estimate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">本月已用／額度</dt>
                    <dd className="tabular-nums">
                      {estimate.monthUsed} / {estimate.monthQuota}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">是否可送</dt>
                    <dd
                      className={
                        estimate.allowed ? 'font-semibold text-green-700' : 'font-semibold text-red-600'
                      }
                    >
                      {estimate.allowed ? '可以送出' : '額度不足'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">估算中…</p>
              )}
              <button
                type="button"
                className="btn-secondary mt-3 w-full text-sm"
                onClick={loadEstimate}
              >
                重新估算
              </button>
            </section>

            <div className="space-y-2">
              {b.status === 'PENDING_REVIEW' || b.status === 'DRAFT' ? (
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={busy}
                  onClick={() =>
                    run(() => api.post(`/operator/broadcasts/${id}/approve`), '已核准')
                  }
                >
                  核准
                </button>
              ) : null}

              {b.status === 'PENDING_REVIEW' ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary w-full text-red-600"
                    disabled={busy}
                    onClick={() => setRejectOpen((v) => !v)}
                  >
                    {rejectOpen ? '取消退回' : '退回'}
                  </button>
                  {rejectOpen ? (
                    <div className="card space-y-2 p-4">
                      <Field label="退回原因" required hint="會顯示給攤商">
                        <textarea
                          className={inputClass}
                          rows={2}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                      </Field>
                      <button
                        type="button"
                        className="btn-primary w-full"
                        disabled={busy || !rejectReason.trim()}
                        onClick={() =>
                          run(
                            () =>
                              api.post(`/operator/broadcasts/${id}/reject`, {
                                reason: rejectReason,
                              }),
                            '已退回',
                          )
                        }
                      >
                        確認退回
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {b.status === 'APPROVED' ? (
                <button
                  type="button"
                  className="btn-primary w-full"
                  disabled={busy || !estimate?.allowed}
                  title={estimate?.allowed ? undefined : '本月額度不足，無法送出'}
                  onClick={() => {
                    if (!window.confirm(`確定要送給 ${estimate?.recipients ?? 0} 位使用者嗎？送出後無法收回。`)) {
                      return
                    }
                    void run(() => api.post(`/operator/broadcasts/${id}/send`), '已送出')
                  }}
                >
                  送出
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </form>

      <Toast message={toast} />
    </>
  )
}
