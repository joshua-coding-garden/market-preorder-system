import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { config } from '../config.js'
import { AppError } from './errors.js'

/**
 * 圖片上傳管線（04 §F、B-12）
 *   輸入：jpg／png／webp，≤ 8MB
 *   主圖：最長邊 1200、WebP q80
 *   縮圖：最長邊 400、WebP q75
 * 原始檔不落地，直接從 buffer 處理。舊圖在新圖寫入成功後刪除。
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const MAIN_MAX_EDGE = 1200
export const THUMB_MAX_EDGE = 400

export interface StoredImage {
  imageUrl: string
  thumbUrl: string
}

function uploadRoot(): string {
  return resolve(process.cwd(), config.UPLOAD_DIR)
}

export function assertAcceptableImage(mimetype: string, byteLength: number): void {
  if (!ALLOWED_MIME.has(mimetype)) {
    throw new AppError('IMAGE_TYPE_UNSUPPORTED', '只接受 JPG、PNG 或 WebP 圖片')
  }
  if (byteLength > MAX_IMAGE_BYTES) {
    throw new AppError('IMAGE_TOO_LARGE', '圖片不能超過 8MB')
  }
}

/**
 * 壓縮並儲存；回傳可公開存取的 URL。
 * `keyPrefix` 例：`products/{productId}`
 */
export async function storeImage(
  buffer: Buffer,
  mimetype: string,
  keyPrefix: string,
): Promise<StoredImage> {
  assertAcceptableImage(mimetype, buffer.byteLength)

  const id = randomUUID()
  const mainKey = `${keyPrefix}/${id}.webp`
  const thumbKey = `${keyPrefix}/${id}_thumb.webp`

  // rotate() 先套用 EXIF 方向，否則手機直拍的照片會倒過來
  const [main, thumb] = await Promise.all([
    sharp(buffer)
      .rotate()
      .resize({
        width: MAIN_MAX_EDGE,
        height: MAIN_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer(),
    sharp(buffer)
      .rotate()
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 75 })
      .toBuffer(),
  ])

  if (config.STORAGE_DRIVER === 's3') {
    // D-12：正式環境走 S3 相容儲存。尚未接上，先擋下來而不是靜默寫到本機。
    throw new AppError(
      'CONFLICT',
      'STORAGE_DRIVER=s3 尚未實作，請先使用 local（見 NOTES.md）',
    )
  }

  const root = uploadRoot()
  const mainPath = join(root, mainKey)
  const thumbPath = join(root, thumbKey)
  await mkdir(dirname(mainPath), { recursive: true })
  await Promise.all([writeFile(mainPath, main), writeFile(thumbPath, thumb)])

  return { imageUrl: `/uploads/${mainKey}`, thumbUrl: `/uploads/${thumbKey}` }
}

/** 刪除舊圖；失敗不影響主流程（檔案可能已被手動移除） */
export async function deleteImage(...urls: (string | null | undefined)[]): Promise<void> {
  if (config.STORAGE_DRIVER !== 'local') return
  const root = uploadRoot()
  await Promise.all(
    urls
      .filter((u): u is string => Boolean(u?.startsWith('/uploads/')))
      .map((u) => unlink(join(root, u.slice('/uploads/'.length))).catch(() => undefined)),
  )
}
