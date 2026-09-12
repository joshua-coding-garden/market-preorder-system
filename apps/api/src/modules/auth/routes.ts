// 權限（04 §H）：
//   GET  /auth/line/start     公開
//   GET  /auth/line/callback  公開
//   POST /auth/logout         requireAuth
//   GET  /me                  requireAuth
import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { lineCallbackQuerySchema, lineStartQuerySchema } from '@market/shared'
import { config, isLineLoginConfigured } from '../../config.js'
import { AppError } from '../../lib/errors.js'
import { signOauthState, verifyOauthState } from '../../lib/jwt.js'
import {
  buildAuthorizeUrl,
  exchangeCodeForIdToken,
  verifyIdToken,
} from '../../lib/lineLogin.js'
import { requireAuth } from '../../plugins/authz.js'
import { getMe, upsertUserFromLine } from './service.js'

/** 只允許站內相對路徑，避免 open redirect */
function safeRedirect(target: string | undefined): string {
  if (!target) return '/'
  if (!/^\/(?!\/)/.test(target)) return '/'
  return target
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/line/start', async (req, reply) => {
    const { redirect } = lineStartQuerySchema.parse(req.query)

    if (!isLineLoginConfigured()) {
      throw new AppError(
        'CONFLICT',
        'LINE Login 尚未設定，請在 .env 填入 LINE_LOGIN_CHANNEL_ID 與 LINE_LOGIN_CHANNEL_SECRET',
      )
    }

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

    return reply.redirect(buildAuthorizeUrl(state, nonce), 302)
  })

  app.get('/auth/line/callback', async (req, reply) => {
    const query = lineCallbackQuerySchema.parse(req.query)
    const stateCookie = req.cookies[config.oauthStateCookieName]
    reply.clearCookie(config.oauthStateCookieName, { path: '/' })

    if (query.error) {
      // 使用者取消授權：回登入頁，不視為系統錯誤
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

  app.post('/auth/logout', async (req, reply) => {
    requireAuth(req)
    reply.clearSessionCookie()
    return { ok: true }
  })

  app.get('/me', async (req) => {
    const userId = requireAuth(req)
    return getMe(userId)
  })
}

export default authRoutes
