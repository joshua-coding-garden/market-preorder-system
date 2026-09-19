import type {
  CreateProductInput,
  ProductComponentInput,
  UpdateProductInput,
} from '@market/shared'
import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'
import { deleteImage, storeImage } from '../../lib/image.js'
import { isUniqueViolation } from '../../lib/inviteCode.js'
import { getSettings } from '../../lib/settings.js'

/**
 * 攤商商品與內容物（03 §4）。
 * B-7：每個查詢都帶 stallId，攤商隔離靠查詢條件而不是前端隱藏。
 */

function serializeProduct(p: {
  id: string
  code: string
  name: string
  description: string | null
  imageUrl: string | null
  thumbUrl: string | null
  basePrice: number
  sortOrder: number
  isActive: boolean
  components?: {
    id: string
    name: string
    extraPrice: number
    allowCustomNote: boolean
    sortOrder: number
    isActive: boolean
  }[]
}) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    thumbUrl: p.thumbUrl,
    basePrice: p.basePrice,
    sortOrder: p.sortOrder,
    isActive: p.isActive,
    components: (p.components ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      extraPrice: c.extraPrice,
      allowCustomNote: c.allowCustomNote,
      sortOrder: c.sortOrder,
    })),
  }
}

export async function listProducts(stallId: string, includeInactive = false) {
  const products = await prisma.product.findMany({
    where: { stallId, ...(includeInactive ? {} : { isActive: true }) },
    include: {
      components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return products.map(serializeProduct)
}

/** 取單筆並確認屬於該攤（B-7：不屬於就當作不存在） */
async function getOwnedProduct(stallId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, stallId },
    include: { components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  })
  if (!product) throw notFound('找不到商品')
  return product
}

export async function createProduct(stallId: string, input: CreateProductInput) {
  // ⚠️ 規格外（2026-09-20 指示）：每攤品項上限。
  // 只算上架中的——下架（is_active=false）的商品不佔額度。
  const { maxProductsPerStall } = await getSettings()
  const current = await prisma.product.count({ where: { stallId, isActive: true } })
  if (current >= maxProductsPerStall) {
    throw new AppError(
      'PRODUCT_LIMIT_REACHED',
      `每個攤商最多 ${maxProductsPerStall} 項商品，請先下架用不到的商品`,
    )
  }

  try {
    const product = await prisma.product.create({
      data: {
        stallId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        basePrice: input.basePrice,
        sortOrder: input.sortOrder ?? 0,
        components: input.components?.length
          ? {
              create: input.components.map((c, i) => ({
                name: c.name,
                extraPrice: c.extraPrice,
                allowCustomNote: c.allowCustomNote,
                sortOrder: c.sortOrder || i + 1,
              })),
            }
          : undefined,
      },
      include: { components: { orderBy: { sortOrder: 'asc' } } },
    })
    return serializeProduct(product)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('PRODUCT_CODE_DUPLICATE', `商品代碼 ${input.code} 已存在`)
    }
    throw err
  }
}

export async function updateProduct(
  stallId: string,
  productId: string,
  input: UpdateProductInput,
) {
  await getOwnedProduct(stallId, productId)
  try {
    const product = await prisma.product.update({
      where: { id: productId },
      data: input,
      include: { components: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    })
    return serializeProduct(product)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('PRODUCT_CODE_DUPLICATE', '商品代碼已存在')
    }
    throw err
  }
}

/** 軟刪：is_active=false（已成立訂單的快照不受影響） */
export async function deactivateProduct(stallId: string, productId: string) {
  await getOwnedProduct(stallId, productId)
  await prisma.product.update({ where: { id: productId }, data: { isActive: false } })
}

/**
 * 整組取代內容物（03 §4）：未出現的舊 id → is_active=false。
 * 不實際刪除，因為 order_item_component 用 component_id 做追溯。
 */
export async function replaceComponents(
  stallId: string,
  productId: string,
  input: ProductComponentInput[],
) {
  await getOwnedProduct(stallId, productId)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.productComponent.findMany({ where: { productId } })
    const keptIds = new Set(input.map((c) => c.id).filter(Boolean) as string[])

    for (const old of existing) {
      if (!keptIds.has(old.id) && old.isActive) {
        await tx.productComponent.update({
          where: { id: old.id },
          data: { isActive: false },
        })
      }
    }

    for (const [i, c] of input.entries()) {
      const data = {
        name: c.name,
        extraPrice: c.extraPrice,
        allowCustomNote: c.allowCustomNote,
        sortOrder: c.sortOrder || i + 1,
        isActive: true,
      }
      if (c.id && existing.some((e) => e.id === c.id)) {
        await tx.productComponent.update({ where: { id: c.id }, data })
      } else {
        await tx.productComponent.create({ data: { ...data, productId } })
      }
    }

    const components = await tx.productComponent.findMany({
      where: { productId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    return components.map((c) => ({
      id: c.id,
      name: c.name,
      extraPrice: c.extraPrice,
      allowCustomNote: c.allowCustomNote,
      sortOrder: c.sortOrder,
    }))
  })
}

/** 上傳商品圖：壓縮 → 寫檔 → 更新欄位 → 刪舊圖（04 §F） */
export async function setProductImage(
  stallId: string,
  productId: string,
  buffer: Buffer,
  mimetype: string,
) {
  const product = await getOwnedProduct(stallId, productId)
  const stored = await storeImage(buffer, mimetype, `products/${productId}`)

  await prisma.product.update({
    where: { id: productId },
    data: { imageUrl: stored.imageUrl, thumbUrl: stored.thumbUrl },
  })

  // 新圖寫入成功後才刪舊圖
  await deleteImage(product.imageUrl, product.thumbUrl)
  return stored
}
