import { config } from '../../config.js'
import type { LineMessage } from './client.js'

/**
 * 訊息樣板（04 §E）。全部繁體中文。
 *
 * 按鈕連結一律用 appLink()：有設 LIFF_ID 時是 LIFF 網址，
 * 在 LINE 內點開會直接以 LINE 身分登入，不用再按一次登入（0916 入口流程）；
 * 沒設 LIFF_ID 就退回 WEB_URL，外部瀏覽器走一般 LINE Login。
 */

/** 圖片等靜態資源的絕對網址（LINE 要求公開 HTTPS，不能是 LIFF 網址） */
function webUrl(path: string): string {
  return `${config.WEB_URL}${path}`
}

/**
 * 組出使用者點擊後要開的網址（純函式，方便測試）。
 * LIFF 網址格式：https://liff.line.me/{LIFF_ID}{path}
 * 前端的 liff.init() 會把 path 還原成 endpoint URL 底下的路徑（liff.state）。
 */
export function buildAppLink(path: string, opts: { liffId: string; webUrl: string }): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return opts.liffId
    ? `https://liff.line.me/${opts.liffId}${normalized}`
    : `${opts.webUrl}${normalized}`
}

export function appLink(path: string): string {
  return buildAppLink(path, { liffId: config.LIFF_ID, webUrl: config.WEB_URL })
}

/**
 * 歡迎訊息（follow 事件）。
 * 0916 入口流程：加入好友 → 點按鈕 → 以 LINE 身分完成註冊並進入網頁。
 */
export function welcomeMessage(): LineMessage[] {
  return [
    {
      type: 'text',
      text: [
        '歡迎加入市集預購！',
        '點下方「本週市集」就能用 LINE 身分直接進入，不用另外註冊。',
        '選好商品與取貨時間後，到現場出示取貨碼付款取貨。',
        '',
        '攤商請點「我是攤商」輸入邀請碼，或直接在這裡輸入：邀請碼 XXXX',
      ].join('\n'),
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'uri', label: '本週市集', uri: appLink('/') },
          },
          {
            type: 'action',
            action: { type: 'uri', label: '我的訂單', uri: appLink('/orders') },
          },
          {
            type: 'action',
            action: { type: 'uri', label: '我是攤商', uri: appLink('/stall/redeem') },
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
            action: { type: 'uri', label: '進入攤商專區', uri: appLink('/stall') },
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
            action: { type: 'uri', label: '開啟攤商專區', uri: appLink('/stall') },
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
              uri: appLink(`/stall/${params.stallId}/days/${params.marketDayId}/orders`),
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
              uri: appLink(`/orders/${params.preorderId}`),
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
    const url = params.imageUrl.startsWith('http') ? params.imageUrl : webUrl(params.imageUrl)
    messages.push({ type: 'image', originalContentUrl: url, previewImageUrl: url })
  }
  const text = params.title ? `${params.title}\n\n${params.bodyText}` : params.bodyText
  messages.push({ type: 'text', text })
  return messages
}
