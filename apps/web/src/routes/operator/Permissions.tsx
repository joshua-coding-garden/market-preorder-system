import { useState } from 'react'
import { api } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { ErrorState, PageHeader, Spinner, formatTaipeiDateTime } from '@/components/common'
import { FormError, Toast } from '@/components/form'
import ImpersonatePicker from '@/components/ImpersonatePicker'

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

const PROVIDER_LABEL: Record<string, string> = {
  LINE: 'LINE',
  GOOGLE: 'Google',
  LOCAL: '帳號密碼',
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
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
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

  if (accounts.loading) return <Spinner />
  if (accounts.error) return <ErrorState message={accounts.error} onRetry={accounts.reload} />
  if (!accounts.data) return null

  const { summary, items, selfId } = accounts.data

  return (
    <>
      <PageHeader
        title="帳號與權限"
        subtitle="僅管理員可見"
        action={<ImpersonatePicker selfId={selfId} />}
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

      {/* 桌面：表格一列一個帳號，橫向空間才不會浪費 */}
      <div className="hidden px-4 md:block">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">帳號</th>
                <th className="px-3 py-2 font-medium">權限</th>
                <th className="px-3 py-2 font-medium">所屬攤商</th>
                <th className="px-3 py-2 font-medium">最後登入</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((a) => {
                const isSelf = a.id === selfId
                const busy = busyId === a.id
                return (
                  <tr key={a.id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="flex items-center gap-1.5 font-medium">
                        <span>{a.displayName || '（未命名）'}</span>
                        {isSelf ? (
                          <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] text-white">
                            你
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-neutral-500">
                        {PROVIDER_LABEL[a.provider]}｜{a.loginId}
                      </p>
                      {a.provider !== 'LINE' ? (
                        <p className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                          暫時帳號・收不到 LINE 推播
                        </p>
                      ) : null}
                    </td>

                    <td className="px-3 py-3">
                      <select
                        className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
                        value={a.role}
                        disabled={isSelf || busy}
                        onChange={(e) =>
                          run(
                            a.id,
                            () =>
                              api.patch(`/operator/accounts/${a.id}/role`, {
                                role: e.target.value,
                              }),
                            '已更新權限',
                          )
                        }
                      >
                        <option value="operator">系統管理員</option>
                        <option value="user">一般使用者</option>
                      </select>
                      <p
                        className={`mt-1 rounded px-1.5 py-1 text-[10px] leading-snug ${
                          a.role === 'operator'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {ROLE_HINT[a.role]}
                      </p>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.stalls.length === 0 ? (
                          <span className="text-xs text-neutral-400">未綁定</span>
                        ) : (
                          a.stalls.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs text-blue-800"
                            >
                              {s.name}
                              <button
                                type="button"
                                className="rounded-full px-1 text-blue-500 hover:text-blue-800"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    a.id,
                                    () =>
                                      api.delete(`/operator/accounts/${a.id}/stalls/${s.id}`),
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
                        className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs"
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
                        <option value="">＋ 直接加入（不經邀請碼）</option>
                        {stalls.data?.items
                          .filter((s) => !a.stalls.some((x) => x.id === s.id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-500">
                      {a.lastLoginAt ? formatTaipeiDateTime(a.lastLoginAt) : '未曾登入'}
                      <br />
                      <span className="text-neutral-400">
                        建立 {formatTaipeiDateTime(a.createdAt)}
                      </span>
                      {a.orderCount > 0 ? (
                        <>
                          <br />
                          <span className="text-neutral-400">{a.orderCount} 筆訂單</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 手機：一個帳號一張卡 */}
      <ul className="space-y-3 px-4 md:hidden">
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
                    {PROVIDER_LABEL[a.provider]}｜{a.loginId}
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

      <Toast message={toast} />
    </>
  )
}
