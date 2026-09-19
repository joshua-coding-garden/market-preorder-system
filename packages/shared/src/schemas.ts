// 前後端共用的 request schema（B-8）。依 Sprint 逐步補齊。
import { z } from 'zod'
import { ListingApproval, ListingStatus, MarketDayStatus, SubOrderStatus } from './enums.js'
import {
  hhmmSchema,
  inviteCodeSchema,
  isoDateSchema,
  isoDateTimeSchema,
  marketCodeSchema,
  moneySchema,
  phoneSchema,
  productCodeSchema,
  uuidSchema,
} from './primitives.js'

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

/**
 * ⚠️ 規格外：帳號密碼註冊／登入（委託方指示的暫時通道）
 * 帳號 3–20 碼英數與底線（不分大小寫，伺服器一律轉小寫）；密碼至少 8 碼。
 */
export const localUsernameSchema = z
  .string()
  .trim()
  .min(3, '帳號至少 3 個字')
  .max(20, '帳號最多 20 個字')
  .regex(/^[A-Za-z0-9_]+$/, '帳號只能用英文、數字和底線')

export const localPasswordSchema = z
  .string()
  .min(8, '密碼至少 8 個字')
  .max(72, '密碼最多 72 個字')

export const localRegisterSchema = z.object({
  username: localUsernameSchema,
  password: localPasswordSchema,
  displayName: z.string().trim().min(1).max(50).optional(),
})
export type LocalRegisterInput = z.infer<typeof localRegisterSchema>

export const localLoginSchema = z.object({
  username: localUsernameSchema,
  password: z.string().min(1, '請輸入密碼'),
})
export type LocalLoginInput = z.infer<typeof localLoginSchema>

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

/** POST /operator/market-days */
export const createMarketDaySchema = z
  .object({
    marketId: uuidSchema,
    eventDate: isoDateSchema,
    openTime: hhmmSchema,
    closeTime: hhmmSchema,
    /** ISO 8601（UTC）；前端由台北當地時間換算 */
    orderDeadline: isoDateTimeSchema,
    locationNote: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.closeTime > v.openTime, {
    message: '結束時間必須晚於開始時間',
    path: ['closeTime'],
  })
export type CreateMarketDayInput = z.infer<typeof createMarketDaySchema>

/** PATCH /operator/market-days/:id（可部分更新） */
export const updateMarketDaySchema = z
  .object({
    eventDate: isoDateSchema.optional(),
    openTime: hhmmSchema.optional(),
    closeTime: hhmmSchema.optional(),
    orderDeadline: isoDateTimeSchema.optional(),
    locationNote: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (v) => !(v.openTime && v.closeTime) || v.closeTime > v.openTime,
    { message: '結束時間必須晚於開始時間', path: ['closeTime'] },
  )
export type UpdateMarketDayInput = z.infer<typeof updateMarketDaySchema>

// ---------- §3 攤商與參與 ----------

/** POST /operator/stalls */
export const createStallSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  contactName: z.string().trim().max(50).optional(),
  contactPhone: phoneSchema.optional(),
})
export type CreateStallInput = z.infer<typeof createStallSchema>

/** PATCH /operator/stalls/:id */
export const updateStallSchema = createStallSchema.partial().extend({
  isActive: z.boolean().optional(),
})
export type UpdateStallInput = z.infer<typeof updateStallSchema>

/**
 * ⚠️ 規格外（2026-09-20 指示）：PATCH /stalls/:stallId —— 攤商自己維護基本資料。
 * 刻意不含 isActive：停用／恢復是管理員的權限，攤商不能自己關掉自己。
 */
export const updateStallSelfSchema = createStallSchema.partial().strict()
export type UpdateStallSelfInput = z.infer<typeof updateStallSelfSchema>

/** ⚠️ 規格外（2026-09-20 指示）：PATCH /operator/markets/:id */
export const updateMarketSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
})
export type UpdateMarketInput = z.infer<typeof updateMarketSchema>

/** POST /operator/market-days/:id/participations */
export const createParticipationSchema = z.object({
  stallId: uuidSchema,
  boothNo: z.string().trim().min(1).max(20),
})
export type CreateParticipationInput = z.infer<typeof createParticipationSchema>

/** PATCH /operator/participations/:id */
export const updateParticipationSchema = z.object({
  boothNo: z.string().trim().min(1).max(20),
})
export type UpdateParticipationInput = z.infer<typeof updateParticipationSchema>

/** POST /stall/invite-codes/redeem；大小寫與空白在伺服器端正規化 */
export const redeemInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase().replace(/\s+/g, ''))
    .pipe(inviteCodeSchema),
})
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>

// ---------- §4 商品與內容物 ----------

export const productComponentInputSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(50),
  extraPrice: moneySchema,
  allowCustomNote: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})
export type ProductComponentInput = z.infer<typeof productComponentInputSchema>

export const createProductSchema = z.object({
  code: productCodeSchema,
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional(),
  basePrice: moneySchema,
  sortOrder: z.number().int().min(0).optional(),
  components: z.array(productComponentInputSchema).max(30).optional(),
})
export type CreateProductInput = z.infer<typeof createProductSchema>

/** PATCH /stalls/:stallId/products/:id（不含 components） */
export const updateProductSchema = createProductSchema
  .omit({ components: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
export type UpdateProductInput = z.infer<typeof updateProductSchema>

/** PUT /stalls/:stallId/products/:id/components：整組取代 */
export const replaceComponentsSchema = z.array(productComponentInputSchema).max(30)
export type ReplaceComponentsInput = z.infer<typeof replaceComponentsSchema>

export const productListQuerySchema = z.object({
  includeInactive: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
})

// ---------- §5 本場上架 ----------

export const listingInputSchema = z.object({
  productId: uuidSchema,
  price: moneySchema,
  maxQty: z.number().int().min(1).nullable().optional(),
  status: z.enum(ListingStatus).default('ON_SALE'),
})
export type ListingInput = z.infer<typeof listingInputSchema>

/** PUT /stalls/:stallId/market-days/:dayId/listings：整組 upsert */
export const replaceListingsSchema = z.array(listingInputSchema).max(500)
export type ReplaceListingsInput = z.infer<typeof replaceListingsSchema>

export const copyListingsSchema = z.object({ sourceDayId: uuidSchema })
export type CopyListingsInput = z.infer<typeof copyListingsSchema>

/**
 * ⚠️ 規格外（2026-09-20 指示）：管理員端的審核。
 */
export const operatorListingQuerySchema = z.object({
  approval: z.enum(ListingApproval).optional(),
  marketDayId: uuidSchema.optional(),
  stallId: uuidSchema.optional(),
})
export type OperatorListingQuery = z.infer<typeof operatorListingQuerySchema>

export const rejectListingSchema = z.object({
  reason: z.string().trim().min(1, '請填寫退回原因').max(200),
})
export type RejectListingInput = z.infer<typeof rejectListingSchema>

/** 管理員強制上／下架 */
export const operatorUpdateListingSchema = z.object({
  status: z.enum(ListingStatus).optional(),
  price: moneySchema.optional(),
  maxQty: z.number().int().min(1).nullable().optional(),
})
export type OperatorUpdateListingInput = z.infer<typeof operatorUpdateListingSchema>

/** ⚠️ 規格外（2026-09-20 指示）：PATCH /operator/settings */
export const updateSettingsSchema = z
  .object({
    listingApprovalRequired: z.boolean().optional(),
    maxProductsPerStall: z.number().int().min(1).max(1000).optional(),
    maxStalls: z.number().int().min(1).max(10000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '沒有要修改的欄位' })
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>

export const listingQuerySchema = z.object({
  stallId: uuidSchema.optional(),
  q: z.string().trim().max(50).optional(),
})

// ---------- §6 購物車 ----------

export const cartItemComponentSchema = z.object({
  componentId: uuidSchema,
})

export const addCartItemSchema = z.object({
  marketDayId: uuidSchema,
  listingId: uuidSchema,
  qty: z.number().int().min(1).max(99),
  components: z.array(cartItemComponentSchema).max(30).default([]),
  /**
   * ⚠️ 偏離 05 §C4（委託方 2026-09-13 指示）：
   * 備註從「每個內容物一個」改成「每個商品項目一個」。
   */
  customNote: z.string().trim().max(100).optional(),
})
export type AddCartItemInput = z.infer<typeof addCartItemSchema>

/** PATCH /cart/items/:id：只能改數量；0 等同刪除 */
export const updateCartItemSchema = z.object({
  qty: z.number().int().min(0).max(99),
})
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>

export const cartQuerySchema = z.object({ marketDayId: uuidSchema })

// ---------- §7 下單 ----------

export const createOrderSchema = z.object({
  marketDayId: uuidSchema,
  contactName: z.string().trim().min(1).max(50),
  contactPhone: phoneSchema,
  /** "HH:mm"，15 分鐘倍數，需落在 [openTime, closeTime]（由伺服器再驗一次） */
  pickupAt: hhmmSchema.refine((v) => Number(v.slice(3, 5)) % 15 === 0, {
    message: '取貨時間需為 15 分鐘的倍數',
  }),
  note: z.string().trim().max(200).optional(),
  idempotencyKey: uuidSchema,
})
export type CreateOrderInput = z.infer<typeof createOrderSchema>

// ---------- §8 攤商訂單 ----------

export const subOrderListQuerySchema = z.object({
  status: z.enum(SubOrderStatus).optional(),
})

export const pickupLookupSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase()),
})
export type PickupLookupInput = z.infer<typeof pickupLookupSchema>

/** PATCH /stalls/:stallId/sub-orders/:id/status：只允許這兩種 */
export const updateSubOrderStatusSchema = z.object({
  status: z.enum(['NO_SHOW', 'CANCELLED']),
})
export type UpdateSubOrderStatusInput = z.infer<typeof updateSubOrderStatusSchema>

// ---------- §10 推播 ----------

export const createBroadcastSchema = z.object({
  composeMode: z.enum(['OPERATOR_COMPOSE', 'STALL_COMPOSE']),
  marketDayId: uuidSchema.optional(),
  title: z.string().trim().max(40).optional(),
  bodyText: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  audience: z
    .enum(['ALL_FRIENDS', 'MARKET_DAY_CUSTOMERS', 'STALL_CUSTOMERS'])
    .optional(),
})
export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>

export const updateBroadcastSchema = z.object({
  marketDayId: uuidSchema.nullable().optional(),
  title: z.string().trim().max(40).optional(),
  bodyText: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  audience: z
    .enum(['ALL_FRIENDS', 'MARKET_DAY_CUSTOMERS', 'STALL_CUSTOMERS'])
    .optional(),
})
export type UpdateBroadcastInput = z.infer<typeof updateBroadcastSchema>

export const rejectBroadcastSchema = z.object({
  reason: z.string().trim().min(1, '請填寫退回原因').max(200),
})
export type RejectBroadcastInput = z.infer<typeof rejectBroadcastSchema>

export const broadcastListQuerySchema = z.object({
  status: z
    .enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SENT', 'FAILED'])
    .optional(),
})

// ---------- 共用 param ----------

export const idParamSchema = z.object({ id: uuidSchema })
export type IdParam = z.infer<typeof idParamSchema>

export const stallIdParamSchema = z.object({ stallId: uuidSchema })
export const stallDayParamSchema = z.object({
  stallId: uuidSchema,
  dayId: uuidSchema,
})
export const stallResourceParamSchema = z.object({
  stallId: uuidSchema,
  id: uuidSchema,
})
