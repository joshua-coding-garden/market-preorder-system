import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'

export interface OrderNewEvent {
  subOrderId: string
  stallId: string
  marketDayId: string
  pickupCode: string
  itemCount: number
  subtotal: number
}

export interface OrderStatusEvent {
  subOrderId: string
  stallId: string
  marketDayId: string
  status: string
  pickedUpAt?: string
}

/**
 * 訂閱 `stall:{stallId}` room（03 §11、D-08）。
 * 連線狀態回傳給畫面顯示；斷線時前端的 60 秒 polling 會補上。
 */
export function useStallSocket(
  stallId: string | null,
  handlers: {
    onOrderNew?: (e: OrderNewEvent) => void
    onOrderStatus?: (e: OrderStatusEvent) => void
    onPrepChanged?: () => void
  },
): { connected: boolean } {
  const [connected, setConnected] = useState(false)
  // 用 ref 保存 handler，避免每次 render 都重新建立連線
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    if (!stallId) return

    const socket: Socket = io({ path: '/socket.io', withCredentials: true })

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('stall:join', { stallId })
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))

    socket.on('order:new', (e: OrderNewEvent) => ref.current.onOrderNew?.(e))
    socket.on('order:status', (e: OrderStatusEvent) => ref.current.onOrderStatus?.(e))
    socket.on('prep:changed', () => ref.current.onPrepChanged?.())

    return () => {
      socket.emit('stall:leave', { stallId })
      socket.disconnect()
    }
  }, [stallId])

  return { connected }
}
