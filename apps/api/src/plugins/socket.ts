import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { Server, type Socket } from 'socket.io'
import { config } from '../config.js'
import { events } from '../lib/events.js'
import { verifySession } from '../lib/jwt.js'
import { managedStallIds } from './authz.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

/**
 * socket.io（03 §11、D-08）
 *   - 連線時以 cookie 驗證，取出 userId
 *   - `stall:join` 由伺服器查 `stall_member` 驗證後才加入 room（B-1）
 *   - 事件來源是 lib/events.ts，service 層不直接碰 socket
 */

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

const socketPlugin: FastifyPluginAsync = async (app) => {
  const io = new Server(app.server, {
    path: '/socket.io',
    // 前端與 API 同源（Vite proxy／反向代理），不需要開放 CORS
    serveClient: false,
  })

  io.use(async (socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, config.sessionCookieName)
    const payload = token ? await verifySession(token) : null
    if (!payload) {
      next(new Error('UNAUTHENTICATED'))
      return
    }
    socket.data.userId = payload.sub
    next()
  })

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string

    socket.on('stall:join', async ({ stallId }: { stallId?: string }) => {
      if (!stallId) {
        socket.emit('error', { message: '缺少 stallId' })
        return
      }
      // operator 可以 join 任意 stall（D-01）；其餘查 stall_member
      const managed = await managedStallIds(userId)
      if (managed !== 'ALL' && !managed.includes(stallId)) {
        socket.emit('error', { message: '沒有權限' })
        return
      }
      await socket.join(`stall:${stallId}`)
      socket.emit('stall:joined', { stallId })
    })

    socket.on('stall:leave', async ({ stallId }: { stallId?: string }) => {
      if (stallId) await socket.leave(`stall:${stallId}`)
    })
  })

  // lib/events.ts → socket room
  events.on('order:new', (payload) => {
    io.to(`stall:${payload.stallId}`).emit('order:new', payload)
    io.to(`stall:${payload.stallId}`).emit('prep:changed', {
      stallId: payload.stallId,
      marketDayId: payload.marketDayId,
    })
  })

  events.on('order:status', (payload) => {
    io.to(`stall:${payload.stallId}`).emit('order:status', payload)
    io.to(`stall:${payload.stallId}`).emit('prep:changed', {
      stallId: payload.stallId,
      marketDayId: payload.marketDayId,
    })
  })

  app.decorate('io', io)
  app.addHook('onClose', async () => {
    await io.close()
  })
}

export default fp(socketPlugin, { name: 'socket' })
