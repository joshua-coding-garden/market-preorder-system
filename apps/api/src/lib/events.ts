import { EventEmitter } from 'node:events'

/**
 * 行程內事件匯流排。
 * service 層只負責發事件，不直接碰 socket.io，這樣：
 *   - 交易可以先 commit，再發事件（03 §7 第 9 步）
 *   - 測試不需要啟動 socket 伺服器
 * Sprint 4 的 socket plugin 會訂閱這些事件並 emit 到對應的 room。
 */

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
  status: 'PENDING' | 'PICKED_UP' | 'NO_SHOW' | 'CANCELLED'
  pickedUpAt?: string
}

interface AppEvents {
  'order:new': [OrderNewEvent]
  'order:status': [OrderStatusEvent]
}

class AppEventBus extends EventEmitter {
  override emit<K extends keyof AppEvents>(event: K, ...args: AppEvents[K]): boolean {
    return super.emit(event, ...args)
  }

  override on<K extends keyof AppEvents>(
    event: K,
    listener: (...args: AppEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void)
  }
}

export const events = new AppEventBus()
