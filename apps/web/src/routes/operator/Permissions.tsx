import { useState } from 'react'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner, formatTaipeiDateTime } from '@/components/common'
import { FormError, Toast } from '@/components/form'

interface Account {
  id: string
  provider: 'LINE' | 'GOOGLE' | 'LOCAL'
  loginId: string
  displayName: string
  role: 'user' | 'operator'
  stalls: { id: string; name: string }[]
  orderCount: number
  createdAt: string
  lastLoginAt: string | null
}

interface AccountsResponse {
  selfId: string
  summary: { operator: number; stall: number; customer: number; total: number }
  items: Account[]
}

interface StallItem {
  id: string
  name: string
}

interface Target {
  id: string
  displayName: string
  role: 'user' | 'operator'
  stalls: { id: string; name: string }[]
}

const ROLE_HINT: Record<string, string> = {
  operator: '看得到廠商後台、可改所有人的權限，並可代任何攤商操作',
  user: '預設身分；綁定攤商後才會有攤商專區',
}

/**
 * ⚠️ 規格外：帳號與權限（委託方 2026-09-12 指示）。
 * 規格 D-01 只有三種身分，這裡把 operator 當成系統管理身分使用，不新增 role。
 */
export default function Permissions() {
  const accounts = useApi<AccountsResponse>('/operator/accounts')
  const stalls = useApi<{ items: StallItem[] }>('/operator/stalls')
  const targets = useApi<{ items: Target[]; enabled: boolean }>(
    '/operator/impersonation/targets',
  )

  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    setError(null)
    try {
      await fn()
      showToast(ok)
      accounts.reload()
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const impersonate = async (body: { as: 'USER'; userId: string } | { as: 'GUEST' }) => {
    setError(null)
    try {
      await api.post('/operator/impersonation', body)
      // 身分整個換掉，重載到顧客首頁最直觀
      window.location.href = '/'
    } catch (err) {
      setError(toMessage(err))
    }
  }

  if (accounts.loading) return <Spinner />
  if (accounts.error) return <ErrorState message={accounts.error} onRetry={accounts.reload} />
  if (!accounts.data) return null

  const { summary, items, selfId } = accounts.data
  // 身分模擬未啟用時，targets 會回 403
  const impersonationEnabled = targets.data?.enabled === true

  return (
    <>
      <PageHeader
        title="帳號與權限"
        subtitle="僅管理員可見"
        action={
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setPickerOpen(true)}
            disabled={!impersonationEnabled}
            title={impersonationEnabled ? undefined : '需在 .env 設定 ENABLE_IMPERSONATION=true'}
          >
            以其他身分檢視
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-2 px-4 pb-4">
        {[
          { n: summary.operator, label: '系統管理員', cls: 'bg-amber-50 text-amber-800' },
          { n: summary.stall, label: '攤商', cls: 'bg-blue-50 text-blue-800' },
          { n: summary.customer, label: '一般使用者', cls: 'bg-neutral-100 text-neutral-700' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl px-3 py-3 text-center ${s.cls}`}>
            <p className="text-2xl font-bold tabular-nums">{s.n}</p>
            <p className="mt-0.5 text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="px-4">
        <FormError message={error} />
      </div>

      <h2 className="px-4 pb-2 pt-1 text-base font-semibold">帳號清單（{summary.total}）</h2>

      <ul className="space-y-3 px-4">
        {items.map((a) => {
          const isSelf = a.id === selfId
          const busy = busyId === a.id
          return (
            <li key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-base font-semibold">
                    <span className="truncate">{a.displayName || '（未命名）'}</span>
                    {isSelf ? (
                      <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white">
                        你
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                    {a.provider === 'GOOGLE' ? 'Google' : a.provider === 'LOCAL' ? '帳號密碼' : 'LINE'}
                    ｜{a.loginId}
                  </p>
                </div>
                {a.provider !== 'LINE' ? (
                  <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                    暫時帳號・收不到 LINE 推播
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                <label className="block text-xs text-neutral-500">權限</label>
                <select
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
                  value={a.role}
                  disabled={isSelf || busy}
                  onChange={(e) =>
                    run(
                      a.id,
                      () =>
                        api.patch(`/operator/accounts/${a.id}/role`, { role: e.target.value }),
                      '已更新權限',
                    )
                  }
                >
                  <option value="operator">系統管理員</option>
                  <option value="user">一般使用者</option>
                </select>
                <p
                  className={`mt-1.5 rounded-md px-2 py-1.5 text-[11px] ${
                    a.role === 'operator'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {ROLE_HINT[a.role]}
                </p>
              </div>

              <div className="mt-3">
                <label className="block text-xs text-neutral-500">所屬攤商</label>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {a.stalls.length === 0 ? (
                    <span className="text-sm text-neutral-400">未綁定</span>
                  ) : (
                    a.stalls.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-xs text-blue-800"
                      >
                        {s.name}
                        <button
                          type="button"
                          className="rounded-full px-1 text-blue-500 hover:text-blue-800"
                          disabled={busy}
                          onClick={() =>
                            run(
                              a.id,
                              () => api.delete(`/operator/accounts/${a.id}/stalls/${s.id}`),
                              '已移除攤商綁定',
                            )
                          }
                          aria-label={`移除 ${s.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <select
                  className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-sm"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const stallId = e.target.value
                    e.target.value = ''
                    run(
                      a.id,
                      () => api.post(`/operator/accounts/${a.id}/stalls`, { stallId }),
                      '已加入攤商',
                    )
                  }}
                >
                  <option value="">＋ 直接加入攤商（不經邀請碼）</option>
                  {stalls.data?.items
                    .filter((s) => !a.stalls.some((x) => x.id === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </div>

              <p className="mt-3 text-[11px] text-neutral-400">
                建立 {formatTaipeiDateTime(a.createdAt)}
                {a.lastLoginAt ? `・最後登入 ${formatTaipeiDateTime(a.lastLoginAt)}` : '・未曾登入'}
                {a.orderCount > 0 ? `・${a.orderCount} 筆訂單` : ''}
              </p>
            </li>
          )
        })}
      </ul>

      <p className="mx-4 my-6 rounded-xl bg-neutral-100 px-3 py-3 text-xs leading-relaxed text-neutral-600">
        權限判斷每次都重新查資料庫，因此改權限對<strong>現有登入立即生效</strong>，對方不需要重新登入。
        你不能更改自己的權限，系統也一定保留至少一位管理員 —— 避免把所有人鎖在系統外面。
      </p>

      {pickerOpen ? (
        <ImpersonatePicker
          targets={targets.data?.items ?? []}
          selfId={selfId}
          onClose={() => setPickerOpen(false)}
          onPick={impersonate}
        />
      ) : null}

      <Toast message={toast} />
    </>
  )
}

function ImpersonatePicker({
  targets,
  selfId,
  onClose,
  onPick,
}: {
  targets: Target[]
  selfId: string
  onClose: () => void
  onPick: (body: { as: 'USER'; userId: string } | { as: 'GUEST' }) => void
}) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-base font-semibold">以其他身分檢視</h2>
          <button type="button" onClick={onClose} className="px-2 text-xl text-neutral-400">
            ×
          </button>
        </div>

        <p className="mb-4 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
          切換之後，你的權限會<strong>真的</strong>降到那個身分 —— 按下不該有的操作會被後端擋下來，
          跟那個身分實際遇到的一模一樣。這不是只把按鈕藏起來。
        </p>

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
        </div>
      </div>
    </div>
  )
}
