import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

// .env 放在 monorepo 根目錄；從本檔往上找到第一個 .env 就載入。
// 真實環境變數優先（dotenv 預設不覆寫）。
function loadDotEnv(): void {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, '.env')
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate })
      return
    }
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

loadDotEnv()

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('Asia/Taipei'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  API_HOST: z.string().default('0.0.0.0'),

  WEB_URL: z.string().url().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL 未設定'),
  TEST_DATABASE_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 字元'),
  COOKIE_SECURE: booleanish.default('false'),

  // LINE Login（Sprint 0 起）
  LINE_LOGIN_CHANNEL_ID: z.string().default(''),
  LINE_LOGIN_CHANNEL_SECRET: z.string().default(''),
  LINE_LOGIN_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/auth/line/callback'),

  // ⚠️ 規格外的暫時登入通道（委託方指示）：Google 第三方登入
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z
    .string()
    .default('http://localhost:3000/api/auth/google/callback'),

  // ⚠️ 規格外：廠商後台的身分模擬功能。正式環境請保持 false
  ENABLE_IMPERSONATION: booleanish.default('false'),

  // LINE Messaging API（Sprint 5 起）
  LINE_MESSAGING_CHANNEL_SECRET: z.string().default(''),
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: z.string().default(''),
  LIFF_ID: z.string().default(''),
  LINE_MONTHLY_MESSAGE_QUOTA: z.coerce.number().int().min(0).default(200),
  PICKUP_REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(8),

  // 圖片儲存（Sprint 2 起）
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
  throw new Error(`環境變數設定錯誤：\n${lines.join('\n')}\n請對照 .env.example 補齊。`)
}

const env = parsed.data

export const config = {
  ...env,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  /** session cookie 名稱（D-11） */
  sessionCookieName: 'mp_session',
  /** LINE OAuth state cookie 名稱 */
  oauthStateCookieName: 'mp_oauth',
  /** session 有效期（D-11：30 天） */
  sessionMaxAgeSeconds: 30 * 24 * 60 * 60,
} as const

export type AppConfig = typeof config

/** 是否已完成 LINE Login 設定（未設定時 /auth/line/start 會給出清楚的錯誤） */
export function isLineLoginConfigured(): boolean {
  return Boolean(config.LINE_LOGIN_CHANNEL_ID && config.LINE_LOGIN_CHANNEL_SECRET)
}
