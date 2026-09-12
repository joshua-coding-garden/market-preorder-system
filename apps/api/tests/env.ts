import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

function findRootEnv(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, '.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * 測試環境變數：載入根目錄 .env，再把 DATABASE_URL 換成 TEST_DATABASE_URL。
 * 測試會清空資料表，因此絕不可指向開發資料庫。
 *
 * 注意：globalSetup 與各測試檔都會呼叫本函式，必須可重複執行。
 * 因此「是否指向開發資料庫」是拿 .env 檔裡宣告的 DATABASE_URL 來比對，
 * 而不是比對已被本函式改寫過的 process.env。
 */
export function loadTestEnv(): void {
  const envPath = findRootEnv()
  const declared = envPath ? dotenv.parse(readFileSync(envPath)) : {}
  if (envPath) dotenv.config({ path: envPath })

  const testUrl = process.env.TEST_DATABASE_URL
  if (!testUrl) {
    throw new Error('TEST_DATABASE_URL 未設定，請對照 .env.example 補齊後再跑測試')
  }
  if (declared.DATABASE_URL && testUrl === declared.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL 不可與 DATABASE_URL 相同（測試會清空資料）')
  }

  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = testUrl
  process.env.TZ = 'Asia/Taipei'
  // 測試不打真的 LINE API（用 tests/lineMock.ts 取代），但 config 仍需通過驗證。
  // channel secret 要有值，webhook 的簽章驗證才測得起來。
  process.env.JWT_SECRET ??= 'test-secret-value-that-is-long-enough-32'
  process.env.LINE_MESSAGING_CHANNEL_SECRET ||= 'test-line-channel-secret'
  process.env.LINE_LOGIN_CHANNEL_ID ||= 'test-login-channel-id'
}
