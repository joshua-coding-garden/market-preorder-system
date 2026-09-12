/**
 * 開一條 ngrok 通道到前端（:5173），並把取得的公開網址寫回 .env。
 *
 * 為什麼是前端而不是 API：`pnpm dev` 的 Vite 會把 /api/* proxy 到 :3000，
 * 所以只要一條通道，網頁與 API 就在同一個 origin，
 * session cookie（SameSite=Lax）不需要任何跨站設定。
 *
 * 用法：
 *   pnpm tunnel        # 保持執行；關掉視窗通道就斷了
 *   pnpm dev           # 另開一個終端機（會讀到剛寫入的 .env）
 *
 * ngrok 免費方案每次重開網址都會變，因此本腳本每次都會重寫 .env，
 * 並提醒你去 LINE Console 更新 Callback URL。
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = resolve(ROOT, '.env')
const WEB_PORT = 5173
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels'

if (!existsSync(ENV_PATH)) {
  console.error('找不到 .env，請先執行： cp .env.example .env')
  process.exit(1)
}

/** 改寫 .env 裡的單一變數（沒有就補在檔尾） */
function setEnvVar(content, key, value) {
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`
}

async function waitForPublicUrl(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(NGROK_API)
      if (res.ok) {
        const { tunnels } = await res.json()
        const https = tunnels?.find((t) => t.public_url?.startsWith('https://'))
        if (https) return https.public_url
      }
    } catch {
      // ngrok 還沒起來，繼續等
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('等不到 ngrok 通道，請確認 ngrok 已安裝且 authtoken 已設定')
}

const ngrok = spawn(
  process.platform === 'win32' ? 'ngrok.exe' : 'ngrok',
  ['http', String(WEB_PORT), '--log', 'stdout', '--log-format', 'logfmt'],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)

ngrok.on('error', (err) => {
  console.error(
    err.code === 'ENOENT'
      ? '找不到 ngrok，請先安裝並執行： ngrok config add-authtoken <你的 token>'
      : err.message,
  )
  process.exit(1)
})

ngrok.stdout.on('data', (chunk) => {
  const text = String(chunk)
  // 只轉發錯誤訊息，避免 authtoken 之類的內容被印出來（B-13）
  if (text.includes('lvl=eror') || text.includes('lvl=crit')) process.stderr.write(text)
})

ngrok.on('exit', (code) => {
  console.log(`\nngrok 已結束（exit ${code}）。通道關閉，公開網址失效。`)
  process.exit(code ?? 0)
})

try {
  const publicUrl = await waitForPublicUrl()
  const callbackUrl = `${publicUrl}/api/auth/line/callback`

  let env = readFileSync(ENV_PATH, 'utf8')
  env = setEnvVar(env, 'WEB_URL', publicUrl)
  env = setEnvVar(env, 'LINE_LOGIN_CALLBACK_URL', callbackUrl)
  // 通道是 HTTPS，session cookie 要帶 Secure 才送得出去
  env = setEnvVar(env, 'COOKIE_SECURE', 'true')
  writeFileSync(ENV_PATH, env)

  console.log('')
  console.log('  公開網址   ', publicUrl)
  console.log('  已寫入 .env：WEB_URL / LINE_LOGIN_CALLBACK_URL / COOKIE_SECURE=true')
  console.log('')
  console.log('  接下來：')
  console.log('    1. 另開終端機執行  pnpm dev   （要重跑才會讀到新的 .env）')
  console.log('    2. 到 LINE Console → LINE Login → Callback URL 填入：')
  console.log(`         ${callbackUrl}`)
  console.log('    3. 手機瀏覽器開  ' + publicUrl)
  console.log('')
  console.log('  ngrok 免費方案第一次進站會有一頁警告，按「Visit Site」即可。')
  console.log('  按 Ctrl+C 結束通道。')
  console.log('')
} catch (err) {
  console.error(err.message)
  ngrok.kill()
  process.exit(1)
}

const stop = () => {
  ngrok.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
