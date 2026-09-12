import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../../config.js'
import { prisma } from '../../lib/db.js'
import { AppError } from '../../lib/errors.js'
import { getLineClient } from '../../lib/line/client.js'
import {
  fallbackMessage,
  inviteInvalidMessage,
  inviteRedeemedMessage,
  openStallMessage,
  welcomeMessage,
} from '../../lib/line/messages.js'
import { redeemInvite } from '../stall/service.js'

/**
 * LINE Messaging API webhook（04 §D）。
 * **必須驗證 `x-line-signature`**，失敗回 400 且不處理任何事件。
 */

/** 文字訊息的邀請碼格式（04 §D） */
const INVITE_PATTERN = /^邀請碼\s*([A-Z0-9]{1,4}\d{8}-\d{4})$/i

export function verifySignature(rawBody: Buffer | string, signature: string | undefined): boolean {
  if (!signature || !config.LINE_MESSAGING_CHANNEL_SECRET) return false

  const expected = createHmac('sha256', config.LINE_MESSAGING_CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64')

  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  // 長度不同時 timingSafeEqual 會丟例外，先擋掉
  return a.length === b.length && timingSafeEqual(a, b)
}

interface LineEvent {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
  postback?: { data?: string }
}

/** 以 line_user_id upsert 使用者；display_name 用 profile API 補 */
async function upsertLineUser(lineUserId: string): Promise<string> {
  const existing = await prisma.appUser.findUnique({ where: { lineUserId } })
  if (existing) return existing.id

  const profile = await getLineClient().getProfile(lineUserId)
  const user = await prisma.appUser.create({
    data: {
      lineUserId,
      displayName: profile?.displayName ?? '',
      pictureUrl: profile?.pictureUrl ?? null,
    },
  })
  return user.id
}

async function reply(replyToken: string | undefined, messages: Parameters<ReturnType<typeof getLineClient>['reply']>[1]) {
  if (!replyToken) return
  try {
    await getLineClient().reply(replyToken, messages)
  } catch {
    // 回覆失敗不影響事件處理結果（replyToken 可能已過期）
  }
}

export async function handleEvent(event: LineEvent): Promise<void> {
  const lineUserId = event.source?.userId
  if (!lineUserId) return

  switch (event.type) {
    case 'follow': {
      await upsertLineUser(lineUserId)
      await reply(event.replyToken, welcomeMessage())
      return
    }

    case 'unfollow': {
      // 不刪帳號（04 §D）；之後推播失敗會記在 notification
      return
    }

    case 'message': {
      if (event.message?.type !== 'text') {
        await reply(event.replyToken, fallbackMessage())
        return
      }

      const text = (event.message.text ?? '').trim()
      const match = INVITE_PATTERN.exec(text)
      if (!match) {
        await reply(event.replyToken, fallbackMessage())
        return
      }

      const userId = await upsertLineUser(lineUserId)
      try {
        // 與網頁端共用同一個 service（03 §3）
        const result = await redeemInvite(userId, match[1])
        await reply(
          event.replyToken,
          inviteRedeemedMessage({
            stallName: result.stall.name,
            eventDate: result.marketDay.eventDate,
            boothNo: result.boothNo,
          }),
        )
      } catch (err) {
        if (err instanceof AppError && err.code === 'INVITE_INVALID') {
          await reply(event.replyToken, inviteInvalidMessage())
          return
        }
        throw err
      }
      return
    }

    case 'postback': {
      const data = new URLSearchParams(event.postback?.data ?? '')
      if (data.get('action') === 'open_stall') {
        await reply(event.replyToken, openStallMessage())
      }
      return
    }

    default:
      return
  }
}

export async function handleWebhook(events: LineEvent[]): Promise<void> {
  for (const event of events) {
    await handleEvent(event)
  }
}
