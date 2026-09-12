// 前後端共用的 request schema（B-8）。依 Sprint 逐步補齊，目前涵蓋 Sprint 0。
import { z } from 'zod'
import { MarketDayStatus } from './enums.js'
import { isoDateSchema, marketCodeSchema, uuidSchema } from './primitives.js'

// ---------- §1 Auth ----------

/** GET /auth/line/start?redirect=/path：只接受站內相對路徑，避免 open redirect */
export const lineStartQuerySchema = z.object({
  redirect: z
    .string()
    .regex(/^\/(?!\/)[^\s]*$/, 'redirect 需為站內相對路徑')
    .max(300)
    .optional(),
})
export type LineStartQuery = z.infer<typeof lineStartQuerySchema>

export const lineCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})
export type LineCallbackQuery = z.infer<typeof lineCallbackQuerySchema>

// ---------- §2 市集與場次 ----------

/** GET /market-days（顧客用；只會回 PUBLISHED） */
export const marketDayListQuerySchema = z.object({
  status: z.literal('PUBLISHED').optional(),
  from: isoDateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})
export type MarketDayListQuery = z.infer<typeof marketDayListQuerySchema>

/** GET /operator/market-days */
export const operatorMarketDayListQuerySchema = z.object({
  marketId: uuidSchema.optional(),
  status: z.enum(MarketDayStatus).optional(),
})
export type OperatorMarketDayListQuery = z.infer<typeof operatorMarketDayListQuerySchema>

/** POST /operator/markets */
export const createMarketSchema = z.object({
  code: marketCodeSchema,
  name: z.string().trim().min(1).max(50),
  location: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
})
export type CreateMarketInput = z.infer<typeof createMarketSchema>

export const idParamSchema = z.object({ id: uuidSchema })
export type IdParam = z.infer<typeof idParamSchema>
