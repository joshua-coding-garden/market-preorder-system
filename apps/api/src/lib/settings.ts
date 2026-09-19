import type { Prisma } from '@prisma/client'
import { prisma } from './db.js'

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：全站設定。
 *
 * `system_setting` 永遠只有 id=1 那一列（migration 建表時就寫進去，且有 CHECK 擋）。
 * 這裡不快取：設定是後台隨時可改的開關，讀一次資料庫比「改了卻沒生效」便宜得多。
 */

export interface SystemSettings {
  listingApprovalRequired: boolean
  maxProductsPerStall: number
  maxStalls: number
}

const FALLBACK: SystemSettings = {
  listingApprovalRequired: false,
  maxProductsPerStall: 10,
  maxStalls: 200,
}

export async function getSettings(
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<SystemSettings> {
  const row = await client.systemSetting.findUnique({ where: { id: 1 } })
  if (!row) return FALLBACK
  return {
    listingApprovalRequired: row.listingApprovalRequired,
    maxProductsPerStall: row.maxProductsPerStall,
    maxStalls: row.maxStalls,
  }
}

export async function updateSettings(
  input: Partial<SystemSettings>,
  updatedByUserId: string,
): Promise<SystemSettings> {
  const row = await prisma.systemSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...input, updatedByUserId },
    update: { ...input, updatedByUserId },
  })
  return {
    listingApprovalRequired: row.listingApprovalRequired,
    maxProductsPerStall: row.maxProductsPerStall,
    maxStalls: row.maxStalls,
  }
}
