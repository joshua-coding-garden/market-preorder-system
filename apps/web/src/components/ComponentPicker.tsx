import { MoneyTWD } from './common'

export interface ComponentOption {
  id: string
  name: string
  extraPrice: number
  allowCustomNote: boolean
}

export interface ComponentSelection {
  componentId: string
}

interface Props {
  options: ComponentOption[]
  value: ComponentSelection[]
  onChange: (next: ComponentSelection[]) => void
  disabled?: boolean
}

/**
 * ComponentPicker（05 §共用元件）：內容物複選 + 特製備註。
 * D-04：每項有加價（≥0），顧客可勾 0～N 項。
 *
 * ⚠️ 偏離 05 §C4（委託方 2026-09-13 指示）：
 * 特製備註原本每個內容物一個，已改成每個商品項目一個，由 C4 在最下方統一收。
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

            </li>
          )
        })}
      </ul>
    </section>
  )
}
