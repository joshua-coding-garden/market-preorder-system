import { config } from '../../config.js'
import type { LineMessage } from './client.js'

/**
 * 訊息樣板（04 §E）。全部繁體中文。
 * 按鈕連到 WEB_URL；LINE 內開啟時走 LIFF，外部瀏覽器則是一般網頁。
 */

function webUrl(path: string): string {
  return `${config.WEB_URL}${path}`
}

/** 歡迎訊息（follow 事件） */
export function welcomeMessage(): LineMessage[] {
  return [
    {
      type: 'text',
      text: '歡迎加入！這裡可以預購週末市集的商品，到現場出示取貨碼付款取貨。\n\n攤商請輸入：邀請碼 XXXX',
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'uri', label: '本週市集', uri: webUrl('/') },
          },
          {
            type: 'action',
            action: { type: 'uri', label: '我的訂單', uri: webUrl('/orders') },
          },
        ],
      },
    },
  ]
}

/** 邀請碼綁定成功 */
export function inviteRedeemedMessage(params: {
  stallName: string
  eventDate: string
  boothNo: string
}): LineMessage[] {
  return [
    {
      type: 'text',
      text: `已綁定 ${params.stallName}，${params.eventDate} 攤位 ${params.boothNo}`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'uri', label: '進入攤商專區', uri: webUrl('/stall') },
          },
        ],
      },
    },
  ]
}

export function inviteInvalidMessage(): LineMessage[] {
  return [{ type: 'text', text: '邀請碼無效或已使用' }]
}

export function fallbackMessage(): LineMessage[] {
  return [{ type: 'text', text: '請使用下方選單操作。攤商請輸入：邀請碼 XXXX' }]
}

export function openStallMessage(): LineMessage[] {
  return [
    {
      type: 'text',
      text: '攤商專區：',
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'uri', label: '開啟攤商專區', uri: webUrl('/stall') },
          },
        ],
      },
    },
  ]
}

/** NEW_ORDER：推給該攤所有成員 */
export function newOrderMessage(params: {
  stallName: string
  eventDate: string
  itemCount: number
  subtotal: number
  pickupCode: string
  stallId: string
  marketDayId: string
}): LineMessage[] {
  return [
    {
      type: 'text',
      text: `新訂單｜${params.stallName}｜${params.eventDate}｜${params.itemCount} 項 $${params.subtotal}｜取貨碼 ${params.pickupCode}`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '看訂單',
              uri: webUrl(`/stall/${params.stallId}/days/${params.marketDayId}/orders`),
            },
          },
        ],
      },
    },
  ]
}

/** PICKUP_REMINDER：場次當天早上提醒顧客 */
export function pickupReminderMessage(params: {
  eventDate: string
  stalls: { name: string; pickupCode: string }[]
  pickupAt: string
  preorderId: string
}): LineMessage[] {
  const list = params.stalls.map((s) => `${s.name} ${s.pickupCode}`).join('、')
  return [
    {
      type: 'text',
      text: `今天 ${params.eventDate} 市集，您有 ${params.stalls.length} 攤預購：${list}，取貨時間 ${params.pickupAt}`,
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'uri',
              label: '查看訂單',
              uri: webUrl(`/orders/${params.preorderId}`),
            },
          },
        ],
      },
    },
  ]
}

/** BROADCAST：廠商推播 */
export function broadcastMessage(params: {
  title: string
  bodyText: string
  imageUrl?: string | null
}): LineMessage[] {
  const messages: LineMessage[] = []
  if (params.imageUrl) {
    const url = params.imageUrl.startsWith('http')
      ? params.imageUrl
      : `${config.WEB_URL}${params.imageUrl}`
    messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
  }
  const text = params.title ? `${params.title}\n\n${params.bodyText}` : params.bodyText
  messages.push({ type: 'text', text })
  return messages
}
