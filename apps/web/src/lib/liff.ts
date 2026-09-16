import liff from '@line/liff'
import { ApiError, api } from '@/api/client'

/**
 * LIFF 入口流程（0916）。
 *
 * 使用者從 LINE 的歡迎訊息或圖文選單點進來時，網址是 LIFF 網址，
 * 頁面在 LINE 內建瀏覽器開啟。這時：
 *   1. liff.init() 會把 liff.state 還原成原本要去的路徑
 *   2. 拿 LIFF 的 ID token 打 POST /auth/line/liff，由伺服器驗證後簽發自家 session
 * 使用者不用再按任何登入按鈕。
 *
 * 權限判斷一律以伺服器的 /me 為準，前端不用 LIFF profile 做任何決定。
 */

const RETRY_FLAG = 'liff-login-retried'

let initPromise: Promise<boolean> | null = null

/** 是否在 LINE 內建瀏覽器（不需要 init 就能判斷） */
export function isInLine(): boolean {
  try {
    return liff.isInClient()
  } catch {
    return false
  }
}

async function doInit(): Promise<boolean> {
  try {
    const { liffId } = await api.get<{ liffId: string | null }>('/auth/liff-config')
    if (!liffId) return false
    await liff.init({ liffId })
    return true
  } catch {
    // 沒設定或初始化失敗都當作「LIFF 不可用」，退回一般登入流程
    return false
  }
}

/** 初始化 LIFF（只做一次）。沒設 LIFF_ID 時回 false。 */
export function initLiff(): Promise<boolean> {
  if (!initPromise) initPromise = doInit()
  return initPromise
}

/**
 * 在 LINE 內開啟且尚未登入時，用 LIFF 的 ID token 換 session。
 * 成功回 true，呼叫端接著重新抓 /me。
 */
export async function loginWithLiff(): Promise<boolean> {
  if (!(await initLiff())) return false
  if (!liff.isInClient() || !liff.isLoggedIn()) return false

  const idToken = liff.getIDToken()
  if (!idToken) return false

  try {
    await api.post('/auth/line/liff', { idToken })
    sessionStorage.removeItem(RETRY_FLAG)
    return true
  } catch (err) {
    // ID token 過期時伺服器會回 401：讓 LIFF 重新授權一次（整頁重載）。
    // 用 sessionStorage 記住已重試過，避免無限迴圈。
    if (err instanceof ApiError && err.status === 401 && !sessionStorage.getItem(RETRY_FLAG)) {
      sessionStorage.setItem(RETRY_FLAG, '1')
      liff.login()
    }
    return false
  }
}
