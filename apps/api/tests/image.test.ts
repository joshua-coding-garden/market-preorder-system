/**
 * 07-驗收條件.md §S2：S2-3 ~ S2-5（圖片管線，04 §F）
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import sharp from 'sharp'
import { MAIN_MAX_EDGE, THUMB_MAX_EDGE } from '../src/lib/image.js'
import {
  closeTestApp,
  createStall,
  createUser,
  getTestApp,
  joinStall,
  resetDb,
} from './helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await closeTestApp()
})

async function setup() {
  const app = await getTestApp()
  const user = await createUser({ role: 'user' })
  const stall = await createStall()
  await joinStall(user.id, stall.id)

  const created = await request(app.server)
    .post(`/api/stalls/${stall.id}/products`)
    .set('Cookie', user.cookie)
    .send({ code: 'CR01', name: '可頌', basePrice: 80 })

  return { app, user, stall, productId: created.body.id as string }
}

/** 產生一張指定尺寸的測試圖 */
async function makeImage(
  width: number,
  height: number,
  format: 'jpeg' | 'png' | 'gif' = 'jpeg',
): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
  if (format === 'gif') return base.gif().toBuffer()
  if (format === 'png') return base.png().toBuffer()
  return base.jpeg({ quality: 90 }).toBuffer()
}

describe('S2-3 大圖上傳後的壓縮結果', () => {
  it('4000×3000 JPG → 主圖最長邊 1200 WebP、縮圖最長邊 400 WebP', async () => {
    const { app, user, stall, productId } = await setup()
    const buffer = await makeImage(4000, 3000)

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', user.cookie)
      .attach('file', buffer, { filename: 'big.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(200)
    expect(res.body.imageUrl).toMatch(/^\/uploads\/products\/.+\.webp$/)
    expect(res.body.thumbUrl).toMatch(/_thumb\.webp$/)

    // 直接把檔案抓回來檢查實際尺寸與格式
    const main = await request(app.server).get(res.body.imageUrl)
    expect(main.status).toBe(200)
    const mainMeta = await sharp(main.body).metadata()
    expect(mainMeta.format).toBe('webp')
    expect(Math.max(mainMeta.width ?? 0, mainMeta.height ?? 0)).toBe(MAIN_MAX_EDGE)
    expect(mainMeta.width).toBe(1200)
    expect(mainMeta.height).toBe(900)

    const thumb = await request(app.server).get(res.body.thumbUrl)
    const thumbMeta = await sharp(thumb.body).metadata()
    expect(thumbMeta.format).toBe('webp')
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBe(THUMB_MAX_EDGE)
  })

  it('比 1200 小的圖不會被放大（withoutEnlargement）', async () => {
    const { app, user, stall, productId } = await setup()
    const buffer = await makeImage(600, 400, 'png')

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', user.cookie)
      .attach('file', buffer, { filename: 'small.png', contentType: 'image/png' })

    expect(res.status).toBe(200)
    const main = await request(app.server).get(res.body.imageUrl)
    const meta = await sharp(main.body).metadata()
    expect(meta.width).toBe(600)
    expect(meta.height).toBe(400)
  })

  it('上傳後 product 的 image_url / thumb_url 有值', async () => {
    const { app, user, stall, productId } = await setup()
    const buffer = await makeImage(1600, 1600)

    await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', user.cookie)
      .attach('file', buffer, { filename: 'square.jpg', contentType: 'image/jpeg' })

    const list = await request(app.server)
      .get(`/api/stalls/${stall.id}/products`)
      .set('Cookie', user.cookie)

    expect(list.body.items[0].imageUrl).toBeTruthy()
    expect(list.body.items[0].thumbUrl).toBeTruthy()
  })
})

describe('S2-4 檔案過大', () => {
  it('9MB 檔回 400 IMAGE_TOO_LARGE', async () => {
    const { app, user, stall, productId } = await setup()
    // 用雜訊圖確保壓不小，再補到 9MB
    const noise = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg({ quality: 100 })
      .toBuffer()
    const padded = Buffer.concat([noise, Buffer.alloc(9 * 1024 * 1024)])

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', user.cookie)
      .attach('file', padded, { filename: 'huge.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('IMAGE_TOO_LARGE')
  })
})

describe('S2-5 檔案格式不支援', () => {
  it('.gif 回 400 IMAGE_TYPE_UNSUPPORTED', async () => {
    const { app, user, stall, productId } = await setup()
    const buffer = await makeImage(200, 200, 'gif')

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', user.cookie)
      .attach('file', buffer, { filename: 'animated.gif', contentType: 'image/gif' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('IMAGE_TYPE_UNSUPPORTED')
  })

  it('別攤的商品不能上傳圖片（403）', async () => {
    const { app, stall, productId } = await setup()
    const other = await createUser({ role: 'user' })
    const otherStall = await createStall('別攤')
    await joinStall(other.id, otherStall.id)
    const buffer = await makeImage(300, 300)

    const res = await request(app.server)
      .post(`/api/stalls/${stall.id}/products/${productId}/image`)
      .set('Cookie', other.cookie)
      .attach('file', buffer, { filename: 'x.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(403)
  })
})
