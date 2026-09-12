import fastifyCookie from '@fastify/cookie'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { config } from '../config.js'
import { signOauthState, signSession, verifyOauthState, verifySession } from '../lib/jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** 由 session cookie 解出的使用者 id；未登入為 null。B-1：角色不從此處取得。 */
    sessionUserId: string | null
    /**
     * ⚠️ 規格外：身分模擬中的原始 operator id。
     * 模擬「未登入」時 sessionUserId 是 null，但這裡仍有值。
     */
    impersonatorId: string | null
  }
  interface FastifyReply {
    setSessionCookie(userId: string, impersonatorId?: string): Promise<void>
    clearSessionCookie(): void
    setImpersonatorCookie(operatorId: string): Promise<void>
    clearImpersonatorCookie(): void
  }
}

/** 模擬狀態用的獨立 cookie，讓「模擬成未登入」也能還原 */
const IMPERSONATOR_COOKIE = 'mp_impersonator'

/**
 * Session 解析：只負責從 httpOnly cookie 取出 userId。
 * 權限判斷全部在 plugins/authz.ts，且一律重新查資料庫（B-1）。
 */
const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyCookie)

  app.decorateRequest('sessionUserId', null)
  app.decorateRequest('impersonatorId', null)

  app.decorateReply('setSessionCookie', async function (userId: string, impersonatorId?: string) {
    const token = await signSession(userId, impersonatorId)
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

  app.decorateReply('setImpersonatorCookie', async function (operatorId: string) {
    // 重用 oauth state 的簽章工具：內容一樣是短字串，且同樣不能被竄改
    const token = await signOauthState(operatorId, '/operator/permissions')
    this.setCookie(IMPERSONATOR_COOKIE, token, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 4,
    })
  })

  app.decorateReply('clearImpersonatorCookie', function () {
    this.clearCookie(IMPERSONATOR_COOKIE, { path: '/' })
  })

  app.addHook('onRequest', async (req: FastifyRequest) => {
    const token = req.cookies[config.sessionCookieName]
    if (token) {
      const payload = await verifySession(token)
      // 偽造或過期的 JWT 一律視為未登入（S0-5）
      req.sessionUserId = payload?.sub ?? null
      req.impersonatorId = payload?.imp ?? null
    } else {
      req.sessionUserId = null
      req.impersonatorId = null
    }

    // 模擬成「未登入」時 session 是空的，還原資訊只在這個 cookie 裡
    if (!req.impersonatorId) {
      const impCookie = req.cookies[IMPERSONATOR_COOKIE]
      if (impCookie) {
        const verified = await verifyOauthState(impCookie)
        req.impersonatorId = verified?.state ?? null
      }
    }
  })
}

export default fp(authPlugin, { name: 'auth' })
