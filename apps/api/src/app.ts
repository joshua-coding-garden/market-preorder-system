import { resolve } from 'node:path'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import { config } from './config.js'
import { MAX_IMAGE_BYTES } from './lib/image.js'
import authPlugin from './plugins/auth.js'
import errorPlugin from './plugins/error.js'
import socketPlugin from './plugins/socket.js'
import adminRoutes from './modules/admin/routes.js'
import authRoutes from './modules/auth/routes.js'
import broadcastRoutes from './modules/broadcast/routes.js'
import lineRoutes from './modules/line/routes.js'
import marketRoutes from './modules/market/routes.js'
import orderRoutes from './modules/order/routes.js'
import productRoutes from './modules/product/routes.js'
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

  // 圖片上傳（04 §F）：單檔、上限 8MB，超過在 route 內轉成 IMAGE_TOO_LARGE
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: MAX_IMAGE_BYTES + 1 },
  })

  // STORAGE_DRIVER=local 時由 Fastify 提供 /uploads/*（D-12）
  if (config.STORAGE_DRIVER === 'local') {
    await app.register(fastifyStatic, {
      root: resolve(process.cwd(), config.UPLOAD_DIR),
      prefix: '/uploads/',
      decorateReply: false,
    })
  }

  app.get('/api/health', async () => ({ ok: true, now: new Date().toISOString() }))

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(marketRoutes, { prefix: '/api' })
  await app.register(productRoutes, { prefix: '/api' })
  await app.register(orderRoutes, { prefix: '/api' })
  await app.register(lineRoutes, { prefix: '/api' })
  await app.register(broadcastRoutes, { prefix: '/api' })

  // socket.io 掛在同一個 HTTP server 上（03 §11）
  await app.register(socketPlugin)
  await app.register(stallRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api' })

  return app
}
