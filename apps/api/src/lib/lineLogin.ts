import { config } from '../config.js'
import { AppError } from './errors.js'

/**
 * LINE Login v2.1 客戶端。
 * B-13：不得把 access token / channel secret 寫進 log，本檔一律不 log 回應內容。
 */

const AUTHORIZE_URL = 'https://access.line.me/oauth2/v2.1/authorize'
const TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token'
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'

export interface LineIdTokenPayload {
  /** LINE userId（同一 Provider 內穩定） */
  sub: string
  name?: string
  picture?: string
}

export function buildAuthorizeUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: config.LINE_LOGIN_CALLBACK_URL,
    state,
    scope: 'openid profile',
    nonce,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

/** 用授權碼換 token；只取回 id_token（不回傳 access token 給上層） */
export async function exchangeCodeForIdToken(code: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.LINE_LOGIN_CALLBACK_URL,
    client_id: config.LINE_LOGIN_CHANNEL_ID,
    client_secret: config.LINE_LOGIN_CHANNEL_SECRET,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new AppError('UNAUTHENTICATED', 'LINE 授權失敗，請重新登入')
  }

  const json = (await res.json()) as { id_token?: string }
  if (!json.id_token) {
    throw new AppError('UNAUTHENTICATED', 'LINE 未回傳 ID token')
  }
  return json.id_token
}

/**
 * 伺服器端驗證 ID token（03 §1 要求）。
 * 使用 LINE 官方 verify 端點，同時驗 channel id 與 nonce。
 */
export async function verifyIdToken(
  idToken: string,
  nonce?: string,
): Promise<LineIdTokenPayload> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: config.LINE_LOGIN_CHANNEL_ID,
  })
  if (nonce) body.set('nonce', nonce)

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new AppError('UNAUTHENTICATED', 'LINE 身分驗證失敗，請重新登入')
  }

  const payload = (await res.json()) as LineIdTokenPayload
  if (!payload.sub) {
    throw new AppError('UNAUTHENTICATED', 'LINE 身分驗證失敗，請重新登入')
  }
  return payload
}
