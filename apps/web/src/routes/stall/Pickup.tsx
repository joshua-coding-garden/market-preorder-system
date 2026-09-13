import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PICKUP_ALPHABET, PICKUP_CODE_LENGTH } from '@market/shared'
import { api } from '@/api/client'
import { toMessage } from '@/api/useApi'
import { MoneyTWD, PageHeader, formatTaipeiDateTime } from '@/components/common'
import { FormError, StatusBadge } from '@/components/form'
import { subOrderStatusLabel } from '@/i18n/zh-TW'
import type { StallSubOrder } from './SubOrders'

/**
 * S9 核銷（戶外用）
 * 05 §攤商 View：字級 ≥ 20px、按鈕高度 ≥ 56px、高對比。
 * 4 格輸入自動大寫、自動跳格。
 */
export default function Pickup() {
  const { stallId = '', dayId = '' } = useParams()
  const [chars, setChars] = useState<string[]>(Array(PICKUP_CODE_LENGTH).fill(''))
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [found, setFound] = useState<StallSubOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const code = chars.join('')

  const reset = () => {
    setChars(Array(PICKUP_CODE_LENGTH).fill(''))
    setFound(null)
    setError(null)
    setDone(false)
    inputs.current[0]?.focus()
  }

  const setChar = (index: number, raw: string) => {
    const char = raw.toUpperCase().slice(-1)
    if (char && !PICKUP_ALPHABET.includes(char)) return

    const next = [...chars]
    next[index] = char
    setChars(next)
    setError(null)

    if (char && index < PICKUP_CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus()
    }
    if (next.every(Boolean)) {
      void lookup(next.join(''))
    }
  }

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const lookup = async (value: string) => {
    setBusy(true)
    setError(null)
    setFound(null)
    try {
      const res = await api.post<StallSubOrder>(
        `/stalls/${stallId}/market-days/${dayId}/pickup/lookup`,
        { code: value },
      )
      setFound(res)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (!found) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<StallSubOrder>(
        `/stalls/${stallId}/sub-orders/${found.id}/pickup`,
      )
      setFound(res)
      setDone(true)
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="核銷取貨" subtitle="請顧客出示取貨碼" />

      <div className="px-4">
        <div className="flex justify-center gap-2">
          {chars.map((c, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el
              }}
              value={c}
              onChange={(e) => setChar(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              className="h-20 w-16 rounded-2xl border-2 border-neutral-400 bg-white text-center font-mono text-4xl font-bold uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              maxLength={1}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              aria-label={`取貨碼第 ${i + 1} 碼`}
            />
          ))}
        </div>

        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            className="rounded-xl border-2 border-neutral-300 px-4 text-lg"
            style={{ minHeight: 56 }}
            onClick={reset}
          >
            清除重輸
          </button>
          <button
            type="button"
            className="btn-secondary px-4 text-lg"
            style={{ minHeight: 56 }}
            disabled={code.length !== PICKUP_CODE_LENGTH || busy}
            onClick={() => lookup(code)}
          >
            查詢
          </button>
        </div>

        <div className="mt-4">
          <FormError message={error} />
        </div>

        {found ? (
          <section className="card mt-4 overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <div>
                <p className="text-xl font-bold">{found.contactName}</p>
                <p className="text-base text-neutral-600">
                  取貨時間 <span className="tabular-nums">{found.pickupAt}</span>
                </p>
              </div>
              <StatusBadge status={found.status} label={subOrderStatusLabel[found.status]} />
            </header>

            <ul className="divide-y divide-neutral-100">
              {found.items.map((item, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex justify-between gap-3">
                    <span className="text-lg">
                      {item.productName}
                      <span className="ml-2 font-bold">×{item.qty}</span>
                    </span>
                    <MoneyTWD value={item.lineTotal} />
                  </div>
                  {item.components.length > 0 ? (
                    <ul className="mt-1">
                      {item.components.map((c, j) => (
                        <li key={j} className="text-base text-neutral-600">・{c.name}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.customNote ? (
                    <p className="mt-1 rounded-lg bg-amber-100 px-2 py-1 text-base font-semibold text-amber-900">
                      備註：{item.customNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between px-4 py-3">
              <span className="text-base text-neutral-600">應收</span>
              <span className="text-2xl font-bold">
                <MoneyTWD value={found.subtotal} />
              </span>
            </div>

            <div className="border-t border-neutral-200 p-4">
              {found.status === 'PICKED_UP' ? (
                <div className="text-center">
                  <p className="text-lg font-bold text-green-700">
                    {done ? '核銷完成' : '這筆已經完成取貨'}
                  </p>
                  {found.pickedUpAt ? (
                    <p className="mt-1 text-sm text-neutral-600">
                      {formatTaipeiDateTime(found.pickedUpAt)}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary mt-3 w-full text-lg"
                    style={{ minHeight: 56 }}
                    onClick={reset}
                  >
                    核銷下一筆
                  </button>
                </div>
              ) : found.status === 'PENDING' ? (
                <button
                  type="button"
                  className="btn-primary w-full text-xl"
                  style={{ minHeight: 56 }}
                  disabled={busy}
                  onClick={confirm}
                >
                  {busy ? '處理中…' : '確認取貨'}
                </button>
              ) : (
                <p className="text-center text-lg text-neutral-600">
                  這筆的狀態是「{subOrderStatusLabel[found.status]}」，無法核銷。
                </p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
