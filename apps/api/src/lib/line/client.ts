import { messagingApi } from '@line/bot-sdk'
import { config } from '../../config.js'

/**
 * LINE Messaging API 客戶端（04 §E）。
 *
 * 抽成介面的理由：`lib/line/sender.ts` 是所有 LINE 訊息的唯一出口，
 * 測試要能換成 mock 來驗證「額度不足時完全不呼叫 push」（S5-6）。
 *
 * B-13：本檔與 sender 都不得把 access token／channel secret 寫進 log。
 */

export type LineMessage = messagingApi.Message

export interface LineClient {
  push(to: string, messages: LineMessage[]): Promise<void>
  multicast(to: string[], messages: LineMessage[]): Promise<void>
  broadcast(messages: LineMessage[]): Promise<void>
  reply(replyToken: string, messages: LineMessage[]): Promise<void>
  /** 本月已送則數；取不到時回 null，由 sender fallback 到本地統計（Q5） */
  getConsumption(): Promise<number | null>
  /** 月額度上限；type=none 時回 null，由 sender 用 env 的值 */
  getQuota(): Promise<number | null>
  /** 官方帳號好友數；取不到回 null */
  getFollowerCount(date: string): Promise<number | null>
  getProfile(userId: string): Promise<{ displayName: string; pictureUrl?: string } | null>
}

/** multicast 一次最多 500 人（04 §E） */
export const MULTICAST_BATCH_SIZE = 500

function createRealClient(): LineClient {
  const api = new messagingApi.MessagingApiClient({
    channelAccessToken: config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
  })

  return {
    async push(to, messages) {
      await api.pushMessage({ to, messages })
    },
    async multicast(to, messages) {
      await api.multicast({ to, messages })
    },
    async broadcast(messages) {
      await api.broadcast({ messages })
    },
    async reply(replyToken, messages) {
      await api.replyMessage({ replyToken, messages })
    },
    async getConsumption() {
      try {
        const res = await api.getMessageQuotaConsumption()
        return res.totalUsage ?? null
      } catch {
        return null
      }
    },
    async getQuota() {
      try {
        const res = await api.getMessageQuota()
        return res.type === 'limited' ? (res.value ?? null) : null
      } catch {
        return null
      }
    },
    async getFollowerCount(date) {
      // insight API 不在 MessagingApiClient 的型別表面上，直接打 REST
      try {
        const res = await fetch(
          `https://api.line.me/v2/bot/insight/followers?date=${date}`,
          {
            headers: {
              authorization: `Bearer ${config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
            },
          },
        )
        if (!res.ok) return null
        const json = (await res.json()) as { status?: string; followers?: number }
        return json.status === 'ready' ? (json.followers ?? null) : null
      } catch {
        return null
      }
    },
    async getProfile(userId) {
      try {
        const res = await api.getProfile(userId)
        return { displayName: res.displayName, pictureUrl: res.pictureUrl }
      } catch {
        return null
      }
    },
  }
}

/** 未設定 channel access token 時的替身：不打任何 API，直接失敗 */
function createUnconfiguredClient(): LineClient {
  const fail = async (): Promise<never> => {
    throw new Error('LINE Messaging API 尚未設定（LINE_MESSAGING_CHANNEL_ACCESS_TOKEN）')
  }
  return {
    push: fail,
    multicast: fail,
    broadcast: fail,
    reply: fail,
    getConsumption: async () => null,
    getQuota: async () => null,
    getFollowerCount: async () => null,
    getProfile: async () => null,
  }
}

let client: LineClient | null = null

export function getLineClient(): LineClient {
  if (!client) {
    client = config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN
      ? createRealClient()
      : createUnconfiguredClient()
  }
  return client
}

/** 測試用：注入 mock client */
export function setLineClient(mock: LineClient | null): void {
  client = mock
}

export function isMessagingConfigured(): boolean {
  return Boolean(
    config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN && config.LINE_MESSAGING_CHANNEL_SECRET,
  )
}
