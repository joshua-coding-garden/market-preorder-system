/**
 * 開發用 seed（對應 spec/schema.sql 的 Seed 段，Sprint 0 執行）。
 * 可重複執行（全部 upsert）。
 */
import { PrismaClient } from '@prisma/client'
import {
  addDaysIso,
  hhmmToTime,
  isoDateToDate,
  taipeiToUtc,
  todayInTaipei,
} from '../src/lib/time.js'

const prisma = new PrismaClient()

const ID = {
  market: '00000000-0000-0000-0000-00000000000a',
  day: '00000000-0000-0000-0000-0000000000d1',
  stallBread: '00000000-0000-0000-0000-0000000000b1',
  stallCoffee: '00000000-0000-0000-0000-0000000000b2',
  partBread: '00000000-0000-0000-0000-0000000000e1',
  partCoffee: '00000000-0000-0000-0000-0000000000e2',
  productCroissant: '00000000-0000-0000-0000-0000000000f1',
  productToast: '00000000-0000-0000-0000-0000000000f2',
  productDrip: '00000000-0000-0000-0000-0000000000f3',
} as const

async function main(): Promise<void> {
  const today = todayInTaipei()
  const eventDate = addDaysIso(today, 3)
  // 預購截止：場次前一天 22:00（台北）
  const orderDeadline = taipeiToUtc(addDaysIso(today, 2), '22:00:00')
  // 邀請碼：場次當天 23:59:59 台北失效，60 天後可回收（D-03）
  const expiresAt = taipeiToUtc(eventDate, '23:59:59')
  const recyclableAt = new Date(expiresAt.getTime() + 60 * 24 * 60 * 60 * 1000)

  const market = await prisma.market.upsert({
    where: { id: ID.market },
    create: {
      id: ID.market,
      code: 'A',
      name: '運動中心週末市集',
      location: '台中市○○運動中心外場',
    },
    update: {},
  })

  await prisma.marketDay.upsert({
    where: { id: ID.day },
    create: {
      id: ID.day,
      marketId: market.id,
      eventDate: isoDateToDate(eventDate),
      openTime: hhmmToTime('09:00'),
      closeTime: hhmmToTime('15:00'),
      orderDeadline,
      status: 'PUBLISHED',
    },
    update: {
      eventDate: isoDateToDate(eventDate),
      orderDeadline,
      status: 'PUBLISHED',
    },
  })

  await prisma.stall.upsert({
    where: { id: ID.stallBread },
    create: {
      id: ID.stallBread,
      name: '小麥麵包',
      description: '每天現烤',
      contactName: '王小麥',
      contactPhone: '0911111111',
    },
    update: {},
  })
  await prisma.stall.upsert({
    where: { id: ID.stallCoffee },
    create: {
      id: ID.stallCoffee,
      name: '山上咖啡',
      description: '自家烘焙',
      contactName: '李阿山',
      contactPhone: '0922222222',
    },
    update: {},
  })

  await prisma.participation.upsert({
    where: { id: ID.partBread },
    create: {
      id: ID.partBread,
      marketDayId: ID.day,
      stallId: ID.stallBread,
      boothNo: 'B03',
    },
    update: {},
  })
  await prisma.participation.upsert({
    where: { id: ID.partCoffee },
    create: {
      id: ID.partCoffee,
      marketDayId: ID.day,
      stallId: ID.stallCoffee,
      boothNo: 'B07',
    },
    update: {},
  })

  // 邀請碼格式：{market.code}{YYYYMMDD}-{4 位流水號}（D-03）
  const datePart = eventDate.replaceAll('-', '')
  const inviteSeeds = [
    { participationId: ID.partBread, code: `A${datePart}-0001` },
    { participationId: ID.partCoffee, code: `A${datePart}-0002` },
  ]
  for (const seed of inviteSeeds) {
    const existing = await prisma.inviteCode.findFirst({
      where: { participationId: seed.participationId, status: 'ACTIVE' },
    })
    if (existing) continue
    await prisma.inviteCode.create({
      data: { ...seed, expiresAt, recyclableAt },
    })
  }

  const products = [
    {
      id: ID.productCroissant,
      stallId: ID.stallBread,
      code: 'CR01',
      name: '可頌',
      description: '法國奶油',
      basePrice: 80,
    },
    {
      id: ID.productToast,
      stallId: ID.stallBread,
      code: 'TS01',
      name: '全麥吐司',
      description: '無添加',
      basePrice: 120,
    },
    {
      id: ID.productDrip,
      stallId: ID.stallCoffee,
      code: 'DB01',
      name: '掛耳包',
      description: '中焙 10 入',
      basePrice: 250,
    },
  ]
  for (const p of products) {
    await prisma.product.upsert({ where: { id: p.id }, create: p, update: {} })
  }

  const components = [
    {
      productId: ID.productCroissant,
      name: '加起司',
      extraPrice: 10,
      allowCustomNote: true,
      sortOrder: 1,
    },
    {
      productId: ID.productCroissant,
      name: '加火腿',
      extraPrice: 15,
      allowCustomNote: true,
      sortOrder: 2,
    },
    {
      productId: ID.productDrip,
      name: '深焙',
      extraPrice: 0,
      allowCustomNote: false,
      sortOrder: 1,
    },
  ]
  for (const c of components) {
    const existing = await prisma.productComponent.findFirst({
      where: { productId: c.productId, name: c.name },
    })
    if (existing) continue
    await prisma.productComponent.create({ data: c })
  }

  // 本場上架：所有商品以基本價、上限 30 上架
  for (const p of products) {
    await prisma.listing.upsert({
      where: { marketDayId_productId: { marketDayId: ID.day, productId: p.id } },
      create: {
        marketDayId: ID.day,
        productId: p.id,
        stallId: p.stallId,
        price: p.basePrice,
        maxQty: 30,
      },
      update: {},
    })
  }

  console.log(`Seed 完成：場次 ${eventDate}（PUBLISHED），2 攤商、3 商品、2 張邀請碼`)
  console.log(`邀請碼：A${datePart}-0001（小麥麵包 B03）、A${datePart}-0002（山上咖啡 B07）`)
  console.log('第一次 LINE 登入後，把自己升成 operator：')
  console.log(
    "  UPDATE app_user SET role = 'operator' WHERE line_user_id = 'U...';",
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
