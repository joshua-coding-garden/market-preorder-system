import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { MarketDayDetail } from '@market/shared'
import type { CartData, OrderDetail } from '@/api/cartTypes'
import { ApiError, api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import {
  ErrorState,
  MoneyTWD,
  PageHeader,
  Spinner,
  formatTaipeiDate,
} from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'
import TimeSlider from '@/components/TimeSlider'
import { useSession } from '@/store/session'

/** 進入結帳頁時就產生 idempotencyKey（03 §7） */
function useIdempotencyKey(dayId: string): string {
  return useMemo(() => {
    const storageKey = `mp_idem_${dayId}`
    try {
      const cached = sessionStorage.getItem(storageKey)
      if (cached) return cached
      const fresh = crypto.randomUUID()
      sessionStorage.setItem(storageKey, fresh)
      return fresh
    } catch {
      return crypto.randomUUID()
    }
  }, [dayId])
}

/** C6 結帳 */
export default function Checkout() {
  const { dayId = '' } = useParams()
  const navigate = useNavigate()
  const { me } = useSession()
  const day = useApi<MarketDayDetail>(`/market-days/${dayId}`)
  const cart = useApi<CartData>(`/cart?marketDayId=${dayId}`)
  const idempotencyKey = useIdempotencyKey(dayId)

  const [form, setForm] = useState({ contactName: '', contactPhone: '', note: '' })
  const [pickupAt, setPickupAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  useEffect(() => {
    if (!me) return
    setForm((f) => ({
      ...f,
      contactName: f.contactName || me.displayName,
      contactPhone: f.contactPhone || (me.phone ?? ''),
    }))
  }, [me])

  useEffect(() => {
    if (!day.data || pickupAt) return
    setPickupAt(day.data.openTime)
  }, [day.data, pickupAt])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const order = await api.post<OrderDetail>('/orders', {
        marketDayId: dayId,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        pickupAt,
        ...(form.note ? { note: form.note } : {}),
        idempotencyKey,
      })
      try {
        sessionStorage.removeItem(`mp_idem_${dayId}`)
      } catch {
        // sessionStorage 不可用時忽略
      }
      navigate(`/orders/${order.id}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'MARKET_DAY_CLOSED') {
          setError('本場次預購已截止')
          setTimeout(() => navigate(`/days/${dayId}`), 1500)
          return
        }
        if (err.code === 'LISTING_UNAVAILABLE' || err.code === 'LISTING_LIMIT_EXCEEDED') {
          setError(`${toMessage(err)}，請回購物車調整`)
          setTimeout(() => navigate(`/days/${dayId}/cart`), 1500)
          return
        }
      }
      setError(toMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (day.loading || cart.loading) return <Spinner />
  if (day.error) return <ErrorState message={day.error} onRetry={day.reload} />
  if (!day.data || !cart.data) return null

  if (cart.data.stalls.length === 0) {
    return (
      <>
        <PageHeader title="結帳" />
        <p className="px-4 text-sm text-neutral-600">購物車是空的，請先挑選商品。</p>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="結帳"
        subtitle={`${formatTaipeiDate(day.data.eventDate)}・${day.data.market.name}`}
      />

      <form onSubmit={submit} className="space-y-4 px-4 pb-10">
        <FormError message={error} />

        <div className="card space-y-3 p-4">
          <Field label="取貨人姓名" required>
            <input
              className={inputClass}
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              maxLength={50}
              required
            />
          </Field>
          <Field label="手機號碼" required hint="09 開頭 10 碼，攤商聯絡用">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
              maxLength={10}
              required
            />
          </Field>
        </div>

        <div className="card p-4">
          <TimeSlider
            openTime={day.data.openTime}
            closeTime={day.data.closeTime}
            value={pickupAt || day.data.openTime}
            onChange={setPickupAt}
          />
        </div>

        <div className="card p-4">
          <Field label="備註">
            <textarea
              className={inputClass}
              rows={2}
              maxLength={200}
              placeholder="給攤商的話（選填）"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </Field>
        </div>

        <section className="card overflow-hidden">
          <h2 className="border-b border-neutral-200 px-4 py-2.5 text-base font-semibold">
            訂單摘要
          </h2>
          {cart.data.stalls.map((group) => (
            <div key={group.stall.id} className="border-b border-neutral-100 px-4 py-3">
              <p className="text-sm font-medium">
                {group.stall.name}
                <span className="ml-2 text-xs text-neutral-500">攤位 {group.stall.boothNo}</span>
              </p>
              <ul className="mt-1.5 space-y-1">
                {group.items.map((item) => (
                  <li key={item.id} className="flex justify-between text-sm text-neutral-700">
                    <span className="min-w-0 flex-1 truncate">
                      {item.productName}
                      {item.components.length > 0 ? (
                        <span className="text-neutral-500">
                          （{item.components.map((c) => c.name).join('、')}）
                        </span>
                      ) : null}
                      <span className="text-neutral-500"> ×{item.qty}</span>
                    </span>
                    <MoneyTWD value={item.lineTotal} />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-right text-sm">
                小計 <MoneyTWD value={group.subtotal} />
              </p>
            </div>
          ))}
          <div className="flex items-baseline justify-between px-4 py-3">
            <span className="text-sm text-neutral-600">總計</span>
            <span className="text-xl font-bold">
              <MoneyTWD value={cart.data.total} />
            </span>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
            onClick={() => setPrivacyOpen((v) => !v)}
            aria-expanded={privacyOpen}
          >
            個人資料蒐集告知
            <span className="text-neutral-400">{privacyOpen ? '收合' : '展開'}</span>
          </button>
          {privacyOpen ? (
            <div className="space-y-2 border-t border-neutral-200 px-4 py-3 text-xs leading-relaxed text-neutral-600">
              <p>
                <strong>1. 蒐集者</strong>：本市集主辦單位（廠商）。
              </p>
              <p>
                <strong>2. 蒐集目的</strong>：處理您的預購訂單、現場取貨核對，以及必要時的訂單聯繫。
              </p>
              <p>
                <strong>3. 蒐集的個人資料</strong>：LINE 顯示名稱與大頭貼、您填寫的取貨人姓名與手機號碼、訂單內容與取貨時間。
              </p>
              <p>
                <strong>4. 利用期間、地區與對象</strong>：自您下單起至該場次結案後為止，於中華民國境內，由主辦單位及您所預購的各該攤商使用。攤商只會看到向自己下單的部分。
              </p>
              <p>
                <strong>5. 利用方式</strong>：僅用於訂單處理、備貨與現場取貨核銷，不會提供給前述以外的第三人，也不會用於行銷以外的其他目的。
              </p>
              <p>
                <strong>6. 您的權利</strong>：您可以向主辦單位請求查詢、閱覽、補充、更正、停止利用或刪除您的個人資料。若不提供上述資料，將無法完成預購。
              </p>
            </div>
          ) : null}
        </section>

        <button type="submit" className="btn-primary w-full" disabled={submitting}>
          {submitting ? '送出中…' : '送出預購'}
        </button>
        <p className="text-center text-xs text-neutral-400">
          送出後會為每個攤位產生一組取貨碼，現場出示付款取貨。本系統不收線上付款。
        </p>
      </form>
    </>
  )
}
