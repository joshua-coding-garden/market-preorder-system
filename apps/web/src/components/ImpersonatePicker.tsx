import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { FormError } from './form'

interface Target {
  id: string
  displayName: string
  role: 'user' | 'operator'
  stalls: { id: string; name: string }[]
}

interface TargetsResponse {
  items: Target[]
  enabled: boolean
}

/**
 * ⚠️ 規格外：「以其他身分檢視」（委託方 2026-09-12 指示）。
 *
 * 切換之後權限是**真的**降下去的 —— 換發 session 後所有後端 assert* 照常生效，
 * 不是前端把按鈕藏起來。
 *
 * 這個元件自己管狀態，因此可以同時放在後台標題列與帳號與權限頁。
 *
 * modal 用 portal 掛到 document.body：後台標題列有 `backdrop-blur`，
 * 而 `backdrop-filter` 會為 `position: fixed` 的子元素建立 containing block，
 * 不脫離的話 modal 會被關在那條標題列裡（只有 1024×94），而不是蓋滿整個視窗。
 */
export default function ImpersonatePicker({
  variant = 'button',
  selfId,
}: {
  variant?: 'button' | 'compact'
  selfId?: string
}) {
  const targets = useApi<TargetsResponse>('/operator/impersonation/targets')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 未啟用時（後端回 403）不顯示入口
  if (!targets.data?.enabled) return null

  const pick = async (body: { as: 'USER'; userId: string } | { as: 'GUEST' }) => {
    setError(null)
    try {
      await api.post('/operator/impersonation', body)
      // 身分整個換掉，重載最單純也最不會有殘留狀態
      window.location.href = '/'
    } catch (err) {
      setError(toMessage(err))
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'compact'
            ? 'shrink-0 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700'
            : 'btn-secondary text-sm'
        }
      >
        以其他身分檢視
      </button>

      {open
        ? createPortal(
            <Sheet
              targets={targets.data.items}
              selfId={selfId}
              error={error}
              onClose={() => setOpen(false)}
              onPick={pick}
            />,
            document.body,
          )
        : null}
    </>
  )
}

function Sheet({
  targets,
  selfId,
  error,
  onClose,
  onPick,
}: {
  targets: Target[]
  selfId?: string
  error: string | null
  onClose: () => void
  onPick: (body: { as: 'USER'; userId: string } | { as: 'GUEST' }) => void
}) {
  // 手機上背景若還能捲，會讓人以為畫面卡住；開著時鎖住 body
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Esc 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const others = targets.filter((t) => t.id !== selfId)
  const stallUsers = others.filter((t) => t.role !== 'operator' && t.stalls.length > 0)
  const customers = others.filter((t) => t.role !== 'operator' && t.stalls.length === 0)
  const operators = others.filter((t) => t.role === 'operator')

  const Row = ({ t, desc }: { t: Target; desc: string }) => (
    <button
      type="button"
      className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-left active:bg-neutral-50"
      onClick={() => onPick({ as: 'USER', userId: t.id })}
    >
      <p className="text-sm font-medium">{t.displayName || '（未命名）'}</p>
      <p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
    </button>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-base font-semibold">以其他身分檢視</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 text-xl text-neutral-400"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
          切換之後，你的權限會<strong>真的</strong>降到那個身分 ——
          按下不該有的操作會被後端擋下來，跟那個身分實際遇到的一模一樣。
          這不是只把按鈕藏起來。
        </p>

        <FormError message={error} />

        <div className="space-y-2">
          <button
            type="button"
            className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-left active:bg-neutral-50"
            onClick={() => onPick({ as: 'GUEST' })}
          >
            <p className="text-sm font-medium">訪客（未登入）</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              完全登出的樣子：只看得到公開的場次列表與登入頁
            </p>
          </button>

          {customers.length > 0 ? (
            <>
              <p className="pt-3 text-xs font-medium text-neutral-400">顧客</p>
              {customers.map((t) => (
                <Row key={t.id} t={t} desc="只能瀏覽、下單、看自己的訂單" />
              ))}
            </>
          ) : null}

          {stallUsers.length > 0 ? (
            <>
              <p className="pt-3 text-xs font-medium text-neutral-400">攤商</p>
              {stallUsers.map((t) => (
                <Row
                  key={t.id}
                  t={t}
                  desc={`只看得到 ${t.stalls.map((s) => s.name).join('、')} 的商品與訂單`}
                />
              ))}
            </>
          ) : null}

          {operators.length > 0 ? (
            <>
              <p className="pt-3 text-xs font-medium text-neutral-400">其他管理員</p>
              {operators.map((t) => (
                <Row key={t.id} t={t} desc="與你相同的權限" />
              ))}
            </>
          ) : null}

          {others.length === 0 ? (
            <p className="pt-3 text-xs text-neutral-500">
              目前只有你一個帳號。等其他人登入後就能切換成他們的身分檢視。
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
