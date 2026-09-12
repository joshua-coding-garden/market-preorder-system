import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { goToLogin } from '@/api/client'
import { useApi } from '@/api/useApi'
import { Spinner } from '@/components/common'
import { useSession } from '@/store/session'

interface Providers {
  line: boolean
  google: boolean
}

/** C9 登入 */
export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, loading } = useSession()
  const providers = useApi<Providers>('/auth/providers')

  const redirect = params.get('redirect') ?? '/'
  const denied = params.get('error')

  useEffect(() => {
    if (!loading && me) navigate(redirect, { replace: true })
  }, [loading, me, navigate, redirect])

  if (loading) return <Spinner />

  const lineReady = providers.data?.line ?? false
  const googleReady = providers.data?.google ?? false

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center px-6">
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

      <div className="mt-8 space-y-3">
        <button
          type="button"
          className="w-full rounded-xl bg-[#06C755] px-4 py-4 text-base font-semibold text-white active:bg-[#05a948] disabled:opacity-40"
          onClick={() => goToLogin('line', redirect)}
          disabled={!lineReady}
        >
          使用 LINE 登入
        </button>

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

      {!lineReady ? (
        <p className="mt-4 rounded-xl bg-neutral-100 px-4 py-3 text-xs leading-relaxed text-neutral-600">
          LINE 登入尚未設定。Google 登入是暫時的測試通道，
          用它建立的帳號<strong>收不到 LINE 推播</strong>，
          LINE channel 就緒後請改用 LINE 登入。
        </p>
      ) : null}

      <p className="mt-4 text-center text-xs text-neutral-400">
        我們只會取得您的顯示名稱與大頭貼，用於識別訂單。
      </p>
    </div>
  )
}
