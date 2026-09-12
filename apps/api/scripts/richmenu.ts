/**
 * 建立 LINE 圖文選單（04 §D）。`pnpm line:richmenu`
 *
 * 三格：左「本週市集」→ /、中「我的訂單」→ /orders、右「攤商專區」→ /stall
 * 規格要求用 script 建立，不手動設定。
 *
 * 重複執行會先刪掉同名的舊選單再重建，因此可以安全重跑。
 */
import { Buffer } from 'node:buffer'
import { messagingApi } from '@line/bot-sdk'
import { config } from '../src/config.js'

const RICH_MENU_NAME = 'market-preorder-main'
const WIDTH = 2500
const HEIGHT = 843
const CELL = Math.floor(WIDTH / 3)

const BUTTONS = [
  { label: '本週市集', path: '/' },
  { label: '我的訂單', path: '/orders' },
  { label: '攤商專區', path: '/stall' },
] as const

/** 用 SVG 畫一張選單底圖，再轉成 PNG（LINE 只收 PNG／JPEG） */
async function renderImage(): Promise<Buffer> {
  const { default: sharp } = await import('sharp')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
  ${BUTTONS.map((b, i) => {
    const x = i * CELL
    return `
    <rect x="${x}" y="0" width="${CELL}" height="${HEIGHT}" fill="${i % 2 === 0 ? '#fff7ed' : '#ffffff'}"/>
    <line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="#f5d0a9" stroke-width="${i === 0 ? 0 : 4}"/>
    <text x="${x + CELL / 2}" y="${HEIGHT / 2 + 40}" font-size="110" font-weight="bold"
          text-anchor="middle" fill="#c2410c"
          font-family="Noto Sans TC, PingFang TC, Microsoft JhengHei, sans-serif">${b.label}</text>`
  }).join('')}
</svg>`

  return sharp(Buffer.from(svg)).png().toBuffer()
}

async function main(): Promise<void> {
  if (!config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN) {
    console.error('請先在 .env 設定 LINE_MESSAGING_CHANNEL_ACCESS_TOKEN')
    process.exit(1)
  }

  const api = new messagingApi.MessagingApiClient({
    channelAccessToken: config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
  })
  const blobApi = new messagingApi.MessagingApiBlobClient({
    channelAccessToken: config.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN,
  })

  // 先刪掉同名的舊選單，避免越建越多
  const existing = await api.getRichMenuList()
  for (const menu of existing.richmenus) {
    if (menu.name === RICH_MENU_NAME) {
      await api.deleteRichMenu(menu.richMenuId)
      console.log(`已刪除舊選單 ${menu.richMenuId}`)
    }
  }

  const created = await api.createRichMenu({
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: '開啟選單',
    areas: BUTTONS.map((b, i) => ({
      bounds: { x: i * CELL, y: 0, width: CELL, height: HEIGHT },
      action: { type: 'uri' as const, label: b.label, uri: `${config.WEB_URL}${b.path}` },
    })),
  })

  await blobApi.setRichMenuImage(created.richMenuId, new Blob([await renderImage()], { type: 'image/png' }))
  await api.setDefaultRichMenu(created.richMenuId)

  console.log('圖文選單建立完成：', created.richMenuId)
  console.log('  左：本週市集 →', `${config.WEB_URL}/`)
  console.log('  中：我的訂單 →', `${config.WEB_URL}/orders`)
  console.log('  右：攤商專區 →', `${config.WEB_URL}/stall`)
  console.log('')
  console.log('提醒：WEB_URL 換了（例如 ngrok 重開）就要重跑這支。')
}

main().catch((err) => {
  console.error('建立圖文選單失敗：', err instanceof Error ? err.message : err)
  process.exit(1)
})
