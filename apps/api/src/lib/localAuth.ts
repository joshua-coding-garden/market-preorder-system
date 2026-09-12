import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { config } from '../config.js'

/**
 * ⚠️ 規格外的暫時登入通道（委託方 2026-09-12 指示）：帳號密碼註冊／登入。
 *
 * 正式身分來源是 LINE Login（00 §A、D-11）。這條路徑是 LINE／Google channel
 * 都還沒申請下來時，能先進系統測試用的。
 *
 *   - 憑證存在獨立的 `local_credential` 表，`app_user` 完全不動
 *   - 登入後以 `local:{username}` 寫進 `app_user.line_user_id`
 *   - 這種帳號**收不到 LINE 推播**（sender 會辨識並記 FAILED）
 *
 * 以 `LOCAL_LOGIN_ENABLED` 控制，預設關閉。移除方式見 NOTES.md。
 */

export const LOCAL_USER_PREFIX = 'local:'

const scryptAsync = promisify(scrypt)

const SALT_BYTES = 16
const KEY_BYTES = 64

/** scrypt 雜湊；輸出 `salt:hash`（皆為 hex） */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

/** 固定時間比較，避免用回應時間差反推密碼 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const derived = (await scryptAsync(password, salt, expected.length)) as Buffer
    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

export function isLocalLoginEnabled(): boolean {
  return config.LOCAL_LOGIN_ENABLED
}

/** 帳號一律轉小寫再存，避免 Admin／admin 被當成兩個人 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}
