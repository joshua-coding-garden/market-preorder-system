import fastifyCookie from '@fastify/cookie'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { config } from '../config.js'
import { signSession, verifySession } from '../lib/jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** 由 session cookie 解出的使用者 id；未登入為 null。B-1：角色不從此處取得。 */
    sessionUserId: string | null
  }
  interface FastifyReply {
    setSessionCookie(userId: string): Promise<void>
    clearSessionCookie(): void
  }
}

/**
 * Session 解析：只負責從 httpOnly cookie 取出 userId。
 * 權限判斷全部在 plugins/authz.ts，且一律重新查資料庫（B-1）。
 */
const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie)

  app.decorateRequest('sessionUserId', null)

  app.decorateReply('setSessionCookie', async function (userId: string) {
    const token = await signSession(userId)
    this.setCookie(config.sessionCookieName, token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: config.sessionMaxAgeSeconds,
    })
  })

  app.decorateReply('clearSessionCookie', function () {
    this.clearCookie(config.sessionCookieName, { path: '/' })
  })

  app.addHook('onRequest', async (req: FastifyRequest) => {
    const token = req.cookies[config.sessionCookieName]
    if (!token) {
      req.sessionUserId = null
      return
    }
    const payload = await verifySession(token)
    // 偽造或過期的 JWT 一律視為未登入（S0-5）
    req.sessionUserId = payload?.sub ?? null
  })
}

export default fp(authPlugin, { name: 'auth' })
