// 權限（04 §H）：
//   POST /line/webhook   公開，但必須通過 x-line-signature 驗證
//   POST /auth/line/liff 公開；用 LIFF 的 ID token 換 session
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { config } from '../../config.js'
import { AppError } from '../../lib/errors.js'
import { verifyIdToken } from '../../lib/lineLogin.js'
import { upsertUserFromLine } from '../auth/service.js'
import { handleWebhook, verifySignature } from './webhookService.js'

const liffSchema = z.object({ idToken: z.string().min(1) })

const lineRoutes: FastifyPluginAsync = async (app) => {
  /**
   * webhook 需要原始 bytes 才能算簽章，所以這個 route 自己收 raw body。
   * 註冊在獨立的 scope 裡，不影響其他 route 的 JSON 解析。
   */
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    )

    scope.post('/line/webhook', async (req, reply) => {
      const raw = req.body as Buffer
      const signature = req.headers['x-line-signature']

      if (!verifySignature(raw, typeof signature === 'string' ? signature : undefined)) {
        // 簽章錯誤：400 且不處理任何事件（S5-1）
        reply.code(400)
        return { error: 'VALIDATION', message: 'invalid signature' }
      }

      let payload: { events?: unknown[] }
      try {
        payload = JSON.parse(raw.toString('utf8'))
      } catch {
        reply.code(400)
        return { error: 'VALIDATION', message: 'invalid json' }
      }

      // LINE 要求盡快回 200；處理失敗只記 log，不讓 LINE 一直重送
      try {
        await handleWebhook((payload.events ?? []) as never[])
      } catch (err) {
        req.log.error({ err }, 'line webhook handling failed')
      }
      return { ok: true }
    })
  })

  /**
   * LIFF 登入（04 §D）：前端在 LINE 內取得 ID token，
   * 由伺服器驗證後簽發自家 session。不在前端用 LIFF profile 做任何權限判斷。
   */
  app.post('/auth/line/liff', async (req, reply) => {
    if (!config.LINE_LOGIN_CHANNEL_ID) {
      throw new AppError('CONFLICT', 'LINE Login 尚未設定，無法使用 LIFF 登入')
    }
    const { idToken } = liffSchema.parse(req.body)
    const payload = await verifyIdToken(idToken)
    const userId = await upsertUserFromLine(payload)
    await reply.setSessionCookie(userId)
    return { ok: true }
  })

  /** 前端需要 LIFF_ID 才能初始化 SDK */
  app.get('/auth/liff-config', async () => ({ liffId: config.LIFF_ID || null }))
}

export default lineRoutes
