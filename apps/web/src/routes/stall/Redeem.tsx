import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { toMessage } from '@/api/useApi'
import { PageHeader, formatTaipeiDate } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'
import { useSession } from '@/store/session'

interface RedeemResult {
  stall: { id: string; name: string }
  marketDay: { id: string; eventDate: string; openTime: string; closeTime: string }
  boothNo: string
}

/** S2 邀請碼綁定 */
export default function Redeem() {
  const navigate = useNavigate()
  const { refresh } = useSession()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RedeemResult | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await api.post<RedeemResult>('/stall/invite-codes/redeem', { code })
      setResult(res)
      // 綁定後 capabilities.stall 會變 true，要重新抓 /me 才能進攤商頁
      await refresh()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <>
        <PageHeader title="綁定成功" />
        <div className="card mx-4 p-5 text-center">
          <p className="text-lg font-semibold text-neutral-900">{result.stall.name}</p>
          <p className="mt-2 text-sm text-neutral-600">
            {formatTaipeiDate(result.marketDay.eventDate)}
          </p>
          <p className="mt-1 text-sm text-neutral-600">攤位 {result.boothNo}</p>
          <p className="mt-1 text-sm text-neutral-500 tabular-nums">
            {result.marketDay.openTime}–{result.marketDay.closeTime}
          </p>
          <button
            type="button"
            className="btn-primary mt-6 w-full"
            onClick={() => navigate('/stall', { replace: true })}
          >
            進入攤商專區
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="輸入邀請碼" subtitle="綁定後這個 LINE 帳號就能管理該攤商" />
      <form onSubmit={submit} className="card mx-4 space-y-4 p-4">
        <FormError message={error} />
        <Field label="邀請碼" required hint="主辦單位提供，格式如 A20260912-0001">
          <input
            className={`${inputClass} font-mono text-lg tracking-wider`}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="A20260912-0001"
            required
          />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={busy || !code}>
          {busy ? '綁定中…' : '綁定攤商'}
        </button>
      </form>

      <p className="px-6 pt-4 text-center text-xs text-neutral-400">
        也可以在 LINE 官方帳號輸入「邀請碼 A20260912-0001」完成綁定。
      </p>
    </>
  )
}
