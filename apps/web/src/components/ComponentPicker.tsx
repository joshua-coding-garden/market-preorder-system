import { MoneyTWD } from './common'

export interface ComponentOption {
  id: string
  name: string
  extraPrice: number
  allowCustomNote: boolean
}

export interface ComponentSelection {
  componentId: string
  customNote?: string
}

interface Props {
  options: ComponentOption[]
  value: ComponentSelection[]
  onChange: (next: ComponentSelection[]) => void
  disabled?: boolean
}

/**
 * ComponentPicker（05 §共用元件）：內容物複選 + 特製備註。
 * D-04：每項有加價（≥0），顧客可勾 0～N 項，勾選後才顯示備註輸入
 * （且該項 allow_custom_note 為 true 時才有）。
 */
export default function ComponentPicker({ options, value, onChange, disabled }: Props) {
  if (options.length === 0) return null

  const selected = new Map(value.map((v) => [v.componentId, v]))

  const toggle = (option: ComponentOption) => {
    if (selected.has(option.id)) {
      onChange(value.filter((v) => v.componentId !== option.id))
    } else {
      onChange([...value, { componentId: option.id }])
    }
  }

  const setNote = (componentId: string, note: string) => {
    onChange(
      value.map((v) => (v.componentId === componentId ? { ...v, customNote: note } : v)),
    )
  }

  return (
    <section>
      <h2 className="text-base font-semibold">內容物</h2>
      <p className="mt-0.5 text-xs text-neutral-500">可複選，加價會計入單價</p>
      <ul className="mt-2 space-y-2">
        {options.map((option) => {
          const picked = selected.get(option.id)
          return (
            <li
              key={option.id}
              className={`rounded-xl border px-3 py-2.5 ${
                picked ? 'border-brand-500 bg-brand-50' : 'border-neutral-200'
              }`}
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0"
                  checked={Boolean(picked)}
                  disabled={disabled}
                  onChange={() => toggle(option)}
                />
                <span className="flex-1 text-sm">{option.name}</span>
                <span className="text-sm text-neutral-600">
                  {option.extraPrice > 0 ? (
                    <>
                      +<MoneyTWD value={option.extraPrice} />
                    </>
                  ) : (
                    '不加價'
                  )}
                </span>
              </label>

              {picked && option.allowCustomNote ? (
                <input
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                  placeholder="特製備註（例：不要太焦）"
                  maxLength={100}
                  value={picked.customNote ?? ''}
                  disabled={disabled}
                  onChange={(e) => setNote(option.id, e.target.value)}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
