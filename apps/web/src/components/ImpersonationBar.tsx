import { useState } from 'react'
import { useImpersonation } from '@/store/impersonation'

/**
 * ⚠️ 規格外：模擬中的固定提示列。
 * 模擬時權限是真的降下去的，所以一定要有明顯的視覺提示與還原出口。
 */
export default function ImpersonationBar() {
  const { active, original, target, stop } = useImpersonation()
  const [busy, setBusy] = useState(false)

  if (!active) return null

  const label = target
    ? `${target.displayName}（${target.role === 'operator' ? '管理員' : target.stalls.length > 0 ? `攤商：${target.stalls.map((s) => s.name).join('、')}` : '顧客'}）`
    : '未登入的訪客'

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-400 px-4 py-2 text-sm text-amber-950">
      <p className="min-w-0 truncate">
        <span className="font-semibold">模擬中</span>
        <span className="mx-1.5">·</span>
        正以「{label}」的身分檢視
        {original ? <span className="hidden sm:inline">（原帳號：{original.displayName}）</span> : null}
      </p>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-50 disabled:opacity-60"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void stop().catch(() => setBusy(false))
        }}
      >
        結束模擬
      </button>
    </div>
  )
}
