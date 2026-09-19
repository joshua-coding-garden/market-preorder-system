import { useEffect, useState } from 'react'

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：首頁使用說明。
 *
 * 預設展開，看過一次後收合起來——常客不需要每次都看，
 * 但新來的人第一次打開就該看得到怎麼用。
 */
const SEEN_KEY = 'mp_how_it_works_seen'

const STEPS = [
  {
    n: '1',
    title: '挑場次、逛攤商',
    body: '選一個還沒截止的場次，看看這次有哪些攤商、賣什麼。',
  },
  {
    n: '2',
    title: '加入購物車後送出預購',
    body: '可以一次跟好幾攤訂。填取貨人姓名、手機和想取貨的時間就好，這裡不收線上付款。',
  },
  {
    n: '3',
    title: '等店家確認',
    body: '送出後各攤商會收到通知。店家按下確認接單，訂單才算成立——在「我的訂單」看得到目前是哪個狀態。',
  },
  {
    n: '4',
    title: '當天到攤位出示取貨碼',
    body: '每一攤各有一組取貨碼（例如 B03-001），現場報號碼、付款、取貨。',
  },
]

export default function HowItWorks() {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY)) setOpen(false)
    } catch {
      // 無痕視窗之類讀不到就當作沒看過，維持展開
    }
  }, [])

  const toggle = (): void => {
    setOpen((was) => {
      if (was) {
        try {
          localStorage.setItem(SEEN_KEY, '1')
        } catch {
          // 存不起來只是下次還會展開，不影響功能
        }
      }
      return !was
    })
  }

  return (
    <section className="mx-4 mb-4 overflow-hidden rounded-2xl border border-brand-100 bg-brand-50/60">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-brand-800">怎麼預購？</span>
        <span className="text-xs text-brand-600">{open ? '收合' : '展開'}</span>
      </button>

      {open ? (
        <ol className="space-y-3 border-t border-brand-100 px-4 py-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-800">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
