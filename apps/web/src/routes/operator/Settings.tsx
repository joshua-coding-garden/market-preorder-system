import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'

interface Settings {
  listingApprovalRequired: boolean
  maxProductsPerStall: number
  maxStalls: number
}

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：系統設定。
 * 上架模式（要不要審核）與兩個容量上限都在這裡開關。
 */
export default function OperatorSettings() {
  const { data, loading, error, reload } = useApi<Settings>('/operator/settings')
  const [form, setForm] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!form) return null

  const patch = async (body: Partial<Settings>, optimistic: Partial<Settings>): Promise<void> => {
    setBusy(true)
    setSaveError(null)
    setSaved(false)
    const before = form
    setForm({ ...form, ...optimistic })
    try {
      const next = await api.patch<Settings>('/operator/settings', body)
      setForm(next)
      setSaved(true)
    } catch (err) {
      setForm(before)
      setSaveError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="系統設定" subtitle="上架模式與容量上限" />

      <div className="space-y-4 px-4 pb-10">
        <FormError message={saveError} />
        {saved ? (
          <p className="rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-700">已儲存</p>
        ) : null}

        <section className="card p-4">
          <h2 className="text-base font-semibold">上架模式</h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            決定攤商把商品上架到場次之後，要不要經過你審核才會出現在顧客端。
          </p>

          <div className="mt-3 space-y-2">
            <ModeOption
              checked={!form.listingApprovalRequired}
              disabled={busy}
              title="攤商直接上架"
              body="攤商按下儲存，顧客馬上看得到。不用審，但也擋不住錯價或不合適的照片。"
              onSelect={() =>
                void patch({ listingApprovalRequired: false }, { listingApprovalRequired: false })
              }
            />
            <ModeOption
              checked={form.listingApprovalRequired}
              disabled={busy}
              title="管理員審核後才能上架"
              body="攤商送出後進待審清單，你通過了顧客才看得到。攤商之後改價或改上限也會重新送審。"
              onSelect={() =>
                void patch({ listingApprovalRequired: true }, { listingApprovalRequired: true })
              }
            />
          </div>

          {form.listingApprovalRequired ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              現在已經上架中的商品不受影響，仍然看得到；審核只套用在之後送出的異動。
            </p>
          ) : null}
        </section>

        <section className="card space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold">容量上限</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              超過上限時會擋下新增並回一句說明，既有資料不受影響。
            </p>
          </div>

          <LimitField
            label="每個攤商的品項上限"
            hint="只算上架中的商品，下架的不佔額度"
            value={form.maxProductsPerStall}
            disabled={busy}
            onCommit={(v) => void patch({ maxProductsPerStall: v }, { maxProductsPerStall: v })}
          />
          <LimitField
            label="全站攤商數上限"
            hint="只算啟用中的攤商，停用的不佔額度"
            value={form.maxStalls}
            disabled={busy}
            onCommit={(v) => void patch({ maxStalls: v }, { maxStalls: v })}
          />
        </section>
      </div>
    </>
  )
}

function ModeOption({
  checked,
  disabled,
  title,
  body,
  onSelect,
}: {
  checked: boolean
  disabled: boolean
  title: string
  body: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left ${
        checked ? 'border-brand-400 bg-brand-50' : 'border-neutral-200'
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? 'border-brand-500' : 'border-neutral-300'
        }`}
      >
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-brand-500" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">{body}</span>
      </span>
    </button>
  )
}

/** 數字欄位：離開欄位（或按 Enter）才送出，不要每敲一個字就打一次 API */
function LimitField({
  label,
  hint,
  value,
  disabled,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  disabled: boolean
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const commit = (): void => {
    const n = Number(text)
    if (!Number.isInteger(n) || n < 1) {
      setText(String(value))
      return
    }
    if (n !== value) onCommit(n)
  }

  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        className={inputClass}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Field>
  )
}
