import { createRemoteJWKSet, jwtVerify } from 'jose'
import { config } from '../config.js'
import { AppError } from './errors.js'

/**
 * ⚠️ 規格外的暫時登入通道（委託方 2026-09-12 指示）。
 *
 * 正式身分來源仍是 LINE Login（00 §A、D-11）：
 * `app_user.line_user_id` 同時是 Sprint 5 LINE 推播的投遞目標，
 * Google 帳號無法接收 LINE 推播。這條路徑只供 LINE channel 尚未就緒時測試使用，
 * Google 使用者會以 `google:{sub}` 形式寫進 `line_user_id`，
 * 之後真正用 LINE 登入會是另一個帳號。移除方式見 NOTES.md。
 */

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

/** Google 使用者在本系統的 line_user_id 前綴 */
export const GOOGLE_USER_PREFIX = 'google:'

export interface GoogleIdTokenPayload {
  sub: string
  name?: string
  picture?: string
  email?: string
}

export function isGoogleLoginConfigured(): boolean {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
}

export function buildGoogleAuthorizeUrl(state: string, nonce: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GOOGLE_CALLBACK_URL,
    scope: 'openid profile email',
    state,
    nonce,
    prompt: 'select_account',
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeGoogleCode(code: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.GOOGLE_CALLBACK_URL,
    client_id: config.GOOGLE_CLIENT_ID,
    client_secret: config.GOOGLE_CLIENT_SECRET,
  })

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new AppError('UNAUTHENTICATED', 'Google 授權失敗，請重新登入')

  const json = (await res.json()) as { id_token?: string }
  if (!json.id_token) throw new AppError('UNAUTHENTICATED', 'Google 未回傳 ID token')
  return json.id_token
}

/** 用 Google 的 JWKS 在伺服器端驗 ID token（含 aud、iss、nonce） */
export async function verifyGoogleIdToken(
  idToken: string,
  nonce?: string,
): Promise<GoogleIdTokenPayload> {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.GOOGLE_CLIENT_ID,
    })
    if (nonce && payload.nonce !== nonce) {
      throw new AppError('UNAUTHENTICATED', 'Google 驗證失敗（nonce 不符）')
    }
    if (typeof payload.sub !== 'string') {
      throw new AppError('UNAUTHENTICATED', 'Google 驗證失敗')
    }
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    }
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('UNAUTHENTICATED', 'Google 身分驗證失敗，請重新登入')
  }
}
