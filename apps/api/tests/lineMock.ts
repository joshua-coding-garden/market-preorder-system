import type { LineClient, LineMessage } from '../src/lib/line/client.js'
import { setLineClient } from '../src/lib/line/client.js'

/**
 * 測試用的 LINE client 替身。
 * 記錄每一次呼叫，讓測試能斷言「額度不足時完全沒有呼叫 push」（S5-6）。
 */
export interface MockLineClient extends LineClient {
  calls: {
    push: { to: string; messages: LineMessage[] }[]
    multicast: { to: string[]; messages: LineMessage[] }[]
    broadcast: { messages: LineMessage[] }[]
    reply: { replyToken: string; messages: LineMessage[] }[]
  }
  /** 總共送出的人次（push + multicast 展開 + broadcast 算 1） */
  totalRecipients(): number
  reset(): void
}

export function installMockLine(
  options: {
    /** 本月已用則數；null 代表 API 取不到（sender 會 fallback 本地統計） */
    consumption?: number | null
    /** 月額度；null 代表 type=none（sender 會用 env 的值） */
    quota?: number | null
    followers?: number | null
    profile?: { displayName: string; pictureUrl?: string } | null
    /** 讓送出動作丟出錯誤，用來測 FAILED */
    failSend?: boolean
  } = {},
): MockLineClient {
  const calls: MockLineClient['calls'] = {
    push: [],
    multicast: [],
    broadcast: [],
    reply: [],
  }

  const maybeFail = () => {
    if (options.failSend) throw new Error('mock send failure')
  }

  const mock: MockLineClient = {
    calls,
    totalRecipients() {
      return (
        calls.push.length +
        calls.multicast.reduce((n, c) => n + c.to.length, 0) +
        calls.broadcast.length
      )
    },
    reset() {
      calls.push = []
      calls.multicast = []
      calls.broadcast = []
      calls.reply = []
    },
    async push(to, messages) {
      maybeFail()
      calls.push.push({ to, messages })
    },
    async multicast(to, messages) {
      maybeFail()
      calls.multicast.push({ to, messages })
    },
    async broadcast(messages) {
      maybeFail()
      calls.broadcast.push({ messages })
    },
    async reply(replyToken, messages) {
      calls.reply.push({ replyToken, messages })
    },
    async getConsumption() {
      return options.consumption === undefined ? 0 : options.consumption
    },
    async getQuota() {
      return options.quota === undefined ? 1000 : options.quota
    },
    async getFollowerCount() {
      return options.followers ?? null
    },
    async getProfile() {
      return options.profile === undefined
        ? { displayName: 'LINE 測試使用者' }
        : options.profile
    },
  }

  setLineClient(mock)
  return mock
}

export function uninstallMockLine(): void {
  setLineClient(null)
}
