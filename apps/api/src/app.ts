import Fastify, { type FastifyInstance } from 'fastify'
import { config } from './config.js'
import authPlugin from './plugins/auth.js'
import errorPlugin from './plugins/error.js'
import adminRoutes from './modules/admin/routes.js'
import authRoutes from './modules/auth/routes.js'
import marketRoutes from './modules/market/routes.js'
import stallRoutes from './modules/stall/routes.js'

/**
 * 建立 Fastify app。所有 API 掛在 /api 之下（03 §前言）。
 * 測試直接使用本函式，不啟動 listen。
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.isProduction ? 'info' : 'debug',
          // B-13：不得把 LINE token / channel secret 寫進 log
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            censor: '[REDACTED]',
          },
        },
    trustProxy: true,
  })

  await app.register(errorPlugin)
  await app.register(authPlugin)

  app.get('/api/health', async () => ({ ok: true, now: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(marketRoutes, { prefix: '/api' })
  await app.register(stallRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api' })

  return app
}
