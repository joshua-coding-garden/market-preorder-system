/**
 * 07-驗收條件.md §S4：S4-1（即時推送）的伺服器端驗證。
 * 03 §11：連線以 cookie 驗證、`stall:join` 由伺服器查 stall_member 後才加入 room。
 *
 * 手機端「3 秒內出現新單並閃爍」是 [manual] 項目，這裡驗證伺服器確實推得出去。
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { io as ioClient, type Socket } from 'socket.io-client'
import { closeTestApp, resetDb } from './helpers.js'
import { placeOrder, setupTwoStalls } from './fixtures.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

/**
 * 讓 app 真的 listen 在一個隨機埠，socket.io 才連得上。
 * 測試共用同一個 app 實例，因此只 listen 一次。
 */
let baseUrl: string | null = null
async function listenOnRandomPort(app: Awaited<ReturnType<typeof setupTwoStalls>>['app']) {
  if (baseUrl) return baseUrl
  const address = await app.listen({ port: 0, host: '127.0.0.1' })
  baseUrl = address.replace('http://[::1]', 'http://127.0.0.1')
  return baseUrl
}

function connect(url: string, cookie: string): Socket {
  return ioClient(url, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie },
  })
}

function waitFor<T>(socket: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等不到事件 ${event}`)), ms)
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

describe('socket.io 連線與授權（03 §11）', () => {
  it('沒有 session cookie 連不上', async () => {
    const ctx = await setupTwoStalls()
    const url = await listenOnRandomPort(ctx.app)
    const socket = ioClient(url, { path: '/socket.io', transports: ['websocket'] })

    const err = await new Promise<Error>((resolve) => {
      socket.on('connect_error', resolve)
    })
    expect(err.message).toContain('UNAUTHENTICATED')
    socket.disconnect()
  })

  it('攤商 A 不能 join 攤商 B 的 room', async () => {
    const ctx = await setupTwoStalls()
    const url = await listenOnRandomPort(ctx.app)
    const socket = connect(url, ctx.ownerA.cookie)
    await waitFor(socket, 'connect')

    socket.emit('stall:join', { stallId: ctx.stallB.id })
    const err = await waitFor<{ message: string }>(socket, 'error')
    expect(err.message).toBe('沒有權限')
    socket.disconnect()
  })

  it('S4-1 新子單建立時，該攤的 room 會收到 order:new 與 prep:changed', async () => {
    const ctx = await setupTwoStalls()
    const url = await listenOnRandomPort(ctx.app)
    const socket = connect(url, ctx.ownerA.cookie)
    await waitFor(socket, 'connect')

    socket.emit('stall:join', { stallId: ctx.stallA.id })
    await waitFor(socket, 'stall:joined')

    const orderNew = waitFor<{ stallId: string; pickupCode: string; subtotal: number }>(
      socket,
      'order:new',
    )
    const prepChanged = waitFor<{ stallId: string }>(socket, 'prep:changed')

    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 2 },
    ])

    const event = await orderNew
    expect(event.stallId).toBe(ctx.stallA.id)
    expect(event.pickupCode).toBe(order.subOrders[0].pickupCode)
    expect(event.subtotal).toBe(240)

    expect((await prepChanged).stallId).toBe(ctx.stallA.id)
    socket.disconnect()
  })

  it('只推給有下單的那一攤，別攤收不到', async () => {
    const ctx = await setupTwoStalls()
    const url = await listenOnRandomPort(ctx.app)
    const socketB = connect(url, ctx.ownerB.cookie)
    await waitFor(socketB, 'connect')
    socketB.emit('stall:join', { stallId: ctx.stallB.id })
    await waitFor(socketB, 'stall:joined')

    let received = false
    socketB.on('order:new', () => {
      received = true
    })

    // 只買 A 的商品
    await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    await new Promise((r) => setTimeout(r, 500))

    expect(received).toBe(false)
    socketB.disconnect()
  })

  it('核銷會推 order:status', async () => {
    const ctx = await setupTwoStalls()
    const order = await placeOrder(ctx.app, ctx.customer.cookie, ctx.day.id, [
      { listingId: ctx.listings.toast.id, qty: 1 },
    ])
    const url = await listenOnRandomPort(ctx.app)
    const socket = connect(url, ctx.ownerA.cookie)
    await waitFor(socket, 'connect')
    socket.emit('stall:join', { stallId: ctx.stallA.id })
    await waitFor(socket, 'stall:joined')

    const statusEvent = waitFor<{ subOrderId: string; status: string }>(socket, 'order:status')

    const request = (await import('supertest')).default
    await request(ctx.app.server)
      .post(`/api/stalls/${ctx.stallA.id}/sub-orders/${order.subOrders[0].id}/pickup`)
      .set('Cookie', ctx.ownerA.cookie)
      .expect(200)

    const event = await statusEvent
    expect(event.subOrderId).toBe(order.subOrders[0].id)
    expect(event.status).toBe('PICKED_UP')
    socket.disconnect()
  })
})
