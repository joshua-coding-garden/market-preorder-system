import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { goToLineLogin } from '@/api/client'
import { Spinner } from '@/components/common'
import { useSession } from '@/store/session'

/** C9 登入 */
export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { me, loading } = useSession()

  const redirect = params.get('redirect') ?? '/'
  const denied = params.get('error') === 'line_denied'

  useEffect(() => {
    if (!loading && me) navigate(redirect, { replace: true })
  }, [loading, me, navigate, redirect])

  if (loading) return <Spinner />

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold text-neutral-900">歡迎來到市集預購</h1>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600">
        使用 LINE 登入後，就能跨攤商預購商品、選擇取貨時間，
        並在每個攤位取得專屬取貨碼。現場出示取貨碼付款取貨即可。
      </p>

      {denied ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          尚未完成 LINE 授權，請再試一次。
        </p>
      ) : null}

      <button
        type="button"
        className="mt-8 w-full rounded-xl bg-[#06C755] px-4 py-4 text-base font-semibold text-white active:bg-[#05a948]"
        onClick={() => goToLineLogin(redirect)}
      >
        使用 LINE 登入
      </button>

      <p className="mt-4 text-center text-xs text-neutral-400">
        我們只會取得您的 LINE 顯示名稱與大頭貼，用於識別訂單。
      </p>
    </div>
  )
}
