import { useMemo } from 'react'

interface Props {
  /** "HH:mm" */
  openTime: string
  closeTime: string
  value: string
  onChange: (next: string) => void
}

const STEP_MINUTES = 15

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function toHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * TimeSlider（05 §共用元件、D-06）：
 * 15 分鐘一格，範圍限制在場次的 open_time～close_time。
 */
export default function TimeSlider({ openTime, closeTime, value, onChange }: Props) {
  const { min, max, steps } = useMemo(() => {
    // 起點無條件進位到下一個 15 分刻度，終點無條件捨去
    const rawMin = toMinutes(openTime)
    const rawMax = toMinutes(closeTime)
    const minM = Math.ceil(rawMin / STEP_MINUTES) * STEP_MINUTES
    const maxM = Math.floor(rawMax / STEP_MINUTES) * STEP_MINUTES
    return { min: minM, max: maxM, steps: Math.max(0, (maxM - minM) / STEP_MINUTES) }
  }, [openTime, closeTime])

  const current = Math.min(Math.max(toMinutes(value), min), max)

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-neutral-700">取貨時間</span>
        <span className="text-2xl font-bold tabular-nums text-brand-700">
          {toHhmm(current)}
        </span>
      </div>

      <input
        type="range"
        className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand-500"
        min={min}
        max={max}
        step={STEP_MINUTES}
        value={current}
        onChange={(e) => onChange(toHhmm(Number(e.target.value)))}
        aria-label="取貨時間"
      />

      <div className="mt-1 flex justify-between text-xs text-neutral-500 tabular-nums">
        <span>{toHhmm(min)}</span>
        <span>{steps + 1} 個時段・每 15 分鐘</span>
        <span>{toHhmm(max)}</span>
      </div>
    </div>
  )
}
