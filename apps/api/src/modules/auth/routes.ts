// 權限（04 §H）：
//   GET  /auth/line/start       公開
//   GET  /auth/line/callback    公開
//   GET  /auth/google/start     公開（⚠️ 規格外的暫時登入通道）
//   GET  /auth/google/callback  公開（⚠️ 規格外）
//   GET  /auth/providers        公開；回目前可用的登入方式
//   POST /auth/logout           公開（冪等，只清 cookie）
//   GET  /me                    requireAuth
import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import {
  lineCallbackQuerySchema,
  lineStartQuerySchema,
  localLoginSchema,
  localRegisterSchema,
} from '@market/shared'
import { config, isLineLoginConfigured } from '../../config.js'
import { AppError } from '../../lib/errors.js'
import { signOauthState, verifyOauthState } from '../../lib/jwt.js'
import {
  buildAuthorizeUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
} from '../../lib/lineLogin.js'
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  isGoogleLoginConfigured,
  verifyGoogleIdToken,
} from '../../lib/googleLogin.js'
import { isLocalLoginEnabled } from '../../lib/localAuth.js'
import { requireAuth } from '../../plugins/authz.js'
import {
  getMe,
  loginLocalUser,
  registerLocalUser,
  upsertUserFromGoogle,
  upsertUserFromLine,
} from './service.js'

/** 只允許站內相對路徑，避免 open redirect */
function safeRedirect(target: string | undefined): string {
  if (!target) return '/'
  if (!/^\/(?!\/)/.test(target)) return '/'
  return target
}

/** 產生 state/nonce 並寫進短效 cookie */
async function beginOauth(
  reply: FastifyReply,
  redirect: string | undefined,
): Promise<{ state: string; nonce: string }> {
  const state = randomUUID()
  const nonce = randomUUID()
  const stateToken = await signOauthState(`${state}.${nonce}`, safeRedirect(redirect))

  reply.setCookie(config.oauthStateCookieName, stateToken, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return { state, nonce }
}

const authRoutes: FastifyPluginAsync = async (app) => {
  /** 前端據此決定登入頁顯示哪些按鈕 */
  app.get('/auth/providers', async () => ({
    line: isLineLoginConfigured(),
    google: isGoogleLoginConfigured(),
    local: isLocalLoginEnabled(),
  }))

  // ---------------- 帳號密碼（⚠️ 規格外的暫時通道） ----------------

  function assertLocalLoginEnabled(): void {
    if (!isLocalLoginEnabled()) {
      throw new AppError(
        'FORBIDDEN',
        '帳號密碼登入未啟用。請在 .env 設定 LOCAL_LOGIN_ENABLED=true',
      )
    }
  }

  app.post('/auth/local/register', async (req, reply) => {
    assertLocalLoginEnabled()
    const input = localRegisterSchema.parse(req.body)
    const { userId, promotedToOperator } = await registerLocalUser(input)

    if (promotedToOperator) {
      req.log.warn(
        { username: input.username },
        '第一個註冊的帳號已自動成為管理員（系統原本沒有任何 operator）',
      )
    }

    await reply.setSessionCookie(userId)
    reply.code(201)
    return { ok: true, promotedToOperator }
  })

  app.post('/auth/local/login', async (req, reply) => {
    assertLocalLoginEnabled()
    const input = localLoginSchema.parse(req.body)
    const userId = await loginLocalUser(input)
    await reply.setSessionCookie(userId)
    return { ok: true }
  })

  // ---------------- LINE Login（正式身分來源） ----------------

  app.get('/auth/line/start', async (req, reply) => {
    const { redirect } = lineStartQuerySchema.parse(req.query)

    if (!isLineLoginConfigured()) {
      throw new AppError(
        'CONFLICT',
        'LINE Login 尚未設定，請在 .env 填入 LINE_LOGIN_CHANNEL_ID 與 LINE_LOGIN_CHANNEL_SECRET',
      )
    }

    const { state, nonce } = await beginOauth(reply, redirect)
    return reply.redirect(buildAuthorizeUrl(state, nonce), 302)
  })

  app.get('/auth/line/callback', async (req, reply) => {
    const query = lineCallbackQuerySchema.parse(req.query)
    const stateCookie = req.cookies[config.oauthStateCookieName]
    reply.clearCookie(config.oauthStateCookieName, { path: '/' })

    if (query.error) {
      return reply.redirect(`${config.WEB_URL}/login?error=line_denied`, 302)
    }
    if (!query.code || !query.state || !stateCookie) {
      throw new AppError('UNAUTHENTICATED', 'LINE 授權狀態遺失，請重新登入')
    }

    const verified = await verifyOauthState(stateCookie)
    if (!verified) throw new AppError('UNAUTHENTICATED', 'LINE 授權狀態無效，請重新登入')

    const [expectedState, nonce] = verified.state.split('.')
    if (!expectedState || expectedState !== query.state) {
      throw new AppError('UNAUTHENTICATED', 'LINE 授權狀態不符，請重新登入')
    }

    const idToken = await exchangeCodeForIdToken(query.code)
    const payload = await verifyIdToken(idToken, nonce)
    const userId = await upsertUserFromLine(payload)

    await reply.setSessionCookie(userId)
    return reply.redirect(`${config.WEB_URL}${verified.redirect}`, 302)
  })

  // ---------------- Google Login（⚠️ 規格外的暫時通道） ----------------

  app.get('/auth/google/start', async (req, reply) => {
    const { redirect } = lineStartQuerySchema.parse(req.query)

    if (!isGoogleLoginConfigured()) {
      throw new AppError(
        'CONFLICT',
        'Google 登入尚未設定，請在 .env 填入 GOOGLE_CLIENT_ID 與 GOOGLE_CLIENT_SECRET',
      )
    }

    const { state, nonce } = await beginOauth(reply, redirect)
    return reply.redirect(buildGoogleAuthorizeUrl(state, nonce), 302)
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const query = lineCallbackQuerySchema.parse(req.query)
    const stateCookie = req.cookies[config.oauthStateCookieName]
    reply.clearCookie(config.oauthStateCookieName, { path: '/' })

    if (query.error) {
      return reply.redirect(`${config.WEB_URL}/login?error=google_denied`, 302)
    }
    if (!query.code || !query.state || !stateCookie) {
      throw new AppError('UNAUTHENTICATED', 'Google 授權狀態遺失，請重新登入')
    }

    const verified = await verifyOauthState(stateCookie)
    if (!verified) throw new AppError('UNAUTHENTICATED', 'Google 授權狀態無效，請重新登入')

    const [expectedState, nonce] = verified.state.split('.')
    if (!expectedState || expectedState !== query.state) {
      throw new AppError('UNAUTHENTICATED', 'Google 授權狀態不符，請重新登入')
    }

    const idToken = await exchangeGoogleCode(query.code)
    const payload = await verifyGoogleIdToken(idToken, nonce)
    const userId = await upsertUserFromGoogle(payload)

    await reply.setSessionCookie(userId)
    return reply.redirect(`${config.WEB_URL}${verified.redirect}`, 302)
  })

  // ---------------- Session ----------------

  // 刻意不要求登入：session 過期、或正在「模擬未登入的訪客」時仍要走得出去，
  // 否則前端會抱著一個壞掉的 cookie 卡在 401。對未登入者清 cookie 本來就沒有副作用，
  // 而 session cookie 是 SameSite=Lax，跨站也帶不進來。
  app.post('/auth/logout', async (_req, reply) => {
    reply.clearSessionCookie()
    reply.clearImpersonatorCookie()
    return { ok: true }
  })

  app.get('/me', async (req) => {
    const userId = requireAuth(req)
    return getMe(userId)
  })
}

export default authRoutes
