import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, goToLogin } from '@/api/client'
import { toMessage, useApi } from '@/api/useApi'
import { Spinner } from '@/components/common'
import { Field, FormError, inputClass } from '@/components/form'
import { useSession } from '@/store/session'

interface Providers {
  line: boolean
  google: boolean
  local: boolean
}

/** C9 登入 */
export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, loading, refresh } = useSession()
  const providers = useApi<Providers>('/auth/providers')

  const redirect = params.get('redirect') ?? '/'
  const denied = params.get('error')

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ username: '', password: '', displayName: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && me) navigate(redirect, { replace: true })
  }, [loading, me, navigate, redirect])

  if (loading) return <Spinner />

  const lineReady = providers.data?.line ?? false
  const googleReady = providers.data?.google ?? false
  const localReady = providers.data?.local ?? false

  const submitLocal = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') {
        const res = await api.post<{ promotedToOperator: boolean }>(
          '/auth/local/register',
          {
            username: form.username,
            password: form.password,
            ...(form.displayName ? { displayName: form.displayName } : {}),
          },
        )
        if (res.promotedToOperator) {
          setNotice('這是系統的第一個帳號，已自動設為管理員。')
        }
      } else {
        await api.post('/auth/local/login', {
          username: form.username,
          password: form.password,
        })
      }
      await refresh()
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center px-6 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">歡迎來到市集預購</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600">
        登入後就能跨攤商預購商品、選擇取貨時間，
        並在每個攤位取得專屬取貨碼。現場出示取貨碼付款取貨即可。
      </p>

      {denied ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未完成授權，請再試一次。
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>
      ) : null}

      {/* 帳號密碼（⚠️ 規格外的暫時通道，LINE channel 就緒後請關閉） */}
      {localReady ? (
        <section className="mt-6">
          <div className="flex rounded-xl bg-neutral-100 p-1 text-sm">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`flex-1 rounded-lg py-2 font-medium ${
                  mode === m ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                }`}
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
              >
                {m === 'login' ? '登入' : '註冊新帳號'}
              </button>
            ))}
          </div>

          <form onSubmit={submitLocal} className="mt-4 space-y-3">
            <FormError message={error} />

            <Field label="帳號" required hint="3–20 碼英文、數字或底線">
              <input
                className={inputClass}
                value={form.username}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </Field>

            <Field
              label="密碼"
              required
              hint={mode === 'register' ? '至少 8 個字' : undefined}
            >
              <input
                type="password"
                className={inputClass}
                value={form.password}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>

            {mode === 'register' ? (
              <Field label="顯示名稱" hint="攤商會看到這個名字；留空就用帳號">
                <input
                  className={inputClass}
                  value={form.displayName}
                  maxLength={50}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                />
              </Field>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? '處理中…' : mode === 'login' ? '登入' : '註冊並登入'}
            </button>
          </form>
        </section>
      ) : null}

      {/* 第三方登入 */}
      {lineReady || googleReady ? (
        <div className="mt-6 space-y-3">
          {localReady ? (
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <span className="h-px flex-1 bg-neutral-200" />
              或使用第三方登入
              <span className="h-px flex-1 bg-neutral-200" />
            </div>
          ) : null}

          {lineReady ? (
            <button
              type="button"
              className="w-full rounded-xl bg-[#06C755] px-4 py-4 text-base font-semibold text-white active:bg-[#05a948]"
              onClick={() => goToLogin('line', redirect)}
            >
              使用 LINE 登入
            </button>
          ) : null}

          {googleReady ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-4 text-base font-medium text-neutral-800 active:bg-neutral-50"
              onClick={() => goToLogin('google', redirect)}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5">
                <path
                  fill="#4285F4"
                  d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.4z"
                />
                <path
                  fill="#34A853"
                  d="M24 46c6 0 11-2 14.6-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"
                />
                <path
                  fill="#FBBC05"
                  d="M11.6 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.3C2.8 17.1 2 20.4 2 24s.8 6.9 2.3 9.9l7.3-5.7z"
                />
                <path
                  fill="#EA4335"
                  d="M24 10.7c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.4 2 7.9 6.9 4.3 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.4-9.1z"
                />
              </svg>
              使用 Google 登入
            </button>
          ) : null}
        </div>
      ) : null}

      {!lineReady ? (
        <p className="mt-5 rounded-xl bg-neutral-100 px-4 py-3 text-xs leading-relaxed text-neutral-600">
          LINE 登入尚未設定。帳號密碼是暫時的測試通道，
          用它建立的帳號<strong>收不到 LINE 推播</strong>，
          LINE channel 就緒後請改用 LINE 登入。
        </p>
      ) : null}

      {!lineReady && !googleReady && !localReady ? (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          目前沒有任何可用的登入方式。請在 <code>.env</code> 設定
          <code> LOCAL_LOGIN_ENABLED=true</code> 或填入 LINE Login 憑證。
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs text-neutral-400">
        我們只會取得您的顯示名稱，用於識別訂單。
      </p>
    </div>
  )
}
