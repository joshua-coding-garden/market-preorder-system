import { z } from 'zod'
import { PICKUP_ALPHABET, PICKUP_CODE_LENGTH } from './enums.js'

/** 台灣手機：09 開頭共 10 碼（Q-01：只做格式檢查，不驗證） */
export const phoneSchema = z
  .string()
  .regex(/^09\d{8}$/, '請輸入正確的手機號碼（09 開頭 10 碼）')

/** "HH:mm"（24 小時制） */
export const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, '時間格式需為 HH:mm')

/** "HH:mm" 且為 15 分鐘倍數（D-06） */
export const hhmmQuarterSchema = hhmmSchema.refine(
  (v) => Number(v.slice(3, 5)) % 15 === 0,
  { message: '取貨時間需為 15 分鐘的倍數' },
)

/** "YYYY-MM-DD"（台北當地日期） */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式需為 YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), { message: '日期不存在' })

/** ISO 8601（UTC）時刻字串 */
export const isoDateTimeSchema = z.string().datetime({ offset: true })

export const uuidSchema = z.string().uuid()

/** 市集代號：1–4 碼大寫英數（schema.sql market.code） */
export const marketCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,4}$/, '市集代號需為 1–4 碼大寫英文或數字')

/** 商品代碼：1–16 碼英數與連字號（schema.sql product.code） */
export const productCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,16}$/, '商品代碼需為 1–16 碼英數或連字號')

/** 邀請碼：{市集代號}{YYYYMMDD}-{4 位流水號}（D-03） */
export const inviteCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{1,4}\d{8}-\d{4}$/, '邀請碼格式不正確')

/** 取貨碼：4 碼，字元集見 PICKUP_ALPHABET（D-02） */
export const pickupCodeSchema = z
  .string()
  .regex(
    new RegExp(`^[${PICKUP_ALPHABET}]{${PICKUP_CODE_LENGTH}}$`),
    '取貨碼格式不正確',
  )

/** 整數金額（TWD，元；B-3 不使用浮點數） */
export const moneySchema = z.number().int().min(0, '金額不可為負')

export const qtySchema = z.number().int().min(1).max(99)

/** 分頁參數（03 §前言：預設 50、上限 200） */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: uuidSchema.optional(),
})
export type Pagination = z.infer<typeof paginationSchema>
