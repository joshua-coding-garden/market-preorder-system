/**
 * 展示／測試用的加料資料（`pnpm db:seed:demo`）。
 *
 * `prisma/seed.ts` 嚴格對應 spec/schema.sql 的 Seed 段，不可擴充；
 * 這支則是給人實際點得動的測資：多個攤商、多組邀請碼、三種場次狀態。
 * 可重複執行。正式環境請勿執行。
 */
import { PrismaClient } from '@prisma/client'
import {
  addDaysIso,
  hhmmToTime,
  isoDateToDate,
  taipeiToUtc,
  todayInTaipei,
} from '../src/lib/time.js'
import { buildInviteCode, inviteExpiresAt, inviteRecyclableAt } from '../src/lib/inviteCode.js'

const prisma = new PrismaClient()

const MARKET_ID = '00000000-0000-0000-0000-00000000000a'

/** 攤商 → 商品（含內容物） */
const STALLS = [
  {
    id: '00000000-0000-0000-0000-0000000000b1',
    name: '小麥麵包',
    booth: 'B03',
    description: '每天現烤',
    contactName: '王小麥',
    contactPhone: '0911111111',
    products: [
      {
        code: 'CR01',
        name: '可頌',
        description: '法國奶油',
        basePrice: 80,
        components: [
          { name: '加起司', extraPrice: 10, allowCustomNote: true },
          { name: '加火腿', extraPrice: 15, allowCustomNote: true },
        ],
      },
      { code: 'TS01', name: '全麥吐司', description: '無添加', basePrice: 120, components: [] },
      {
        code: 'BG01',
        name: '貝果',
        description: '原味／芝麻',
        basePrice: 65,
        components: [
          { name: '芝麻', extraPrice: 0, allowCustomNote: false },
          { name: '抹奶油乳酪', extraPrice: 20, allowCustomNote: true },
        ],
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000b2',
    name: '山上咖啡',
    booth: 'B07',
    description: '自家烘焙',
    contactName: '李阿山',
    contactPhone: '0922222222',
    products: [
      {
        code: 'DB01',
        name: '掛耳包',
        description: '中焙 10 入',
        basePrice: 250,
        components: [{ name: '深焙', extraPrice: 0, allowCustomNote: false }],
      },
      {
        code: 'LT01',
        name: '冰拿鐵',
        description: '現場沖煮',
        basePrice: 120,
        components: [
          { name: '換燕麥奶', extraPrice: 20, allowCustomNote: false },
          { name: '去冰', extraPrice: 0, allowCustomNote: true },
        ],
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000b3',
    name: '阿蘭手工水餃',
    booth: 'C01',
    description: '現包冷凍',
    contactName: '陳阿蘭',
    contactPhone: '0933333333',
    products: [
      {
        code: 'DP01',
        name: '高麗菜豬肉水餃',
        description: '20 顆／包',
        basePrice: 180,
        components: [{ name: '加辣', extraPrice: 0, allowCustomNote: true }],
      },
      { code: 'DP02', name: '韭菜水餃', description: '20 顆／包', basePrice: 180, components: [] },
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000b4',
    name: '果然好農園',
    booth: 'C05',
    description: '當季水果',
    contactName: '林果然',
    contactPhone: '0944444444',
    products: [
      { code: 'FR01', name: '愛文芒果（3 斤）', description: '台南玉井', basePrice: 350, components: [] },
      { code: 'FR02', name: '無毒小番茄', description: '一盒 600g', basePrice: 150, components: [] },
    ],
  },
  {
    id: '00000000-0000-0000-0000-0000000000b5',
    name: '花時間乾燥花',
    booth: 'D02',
    description: '手作乾燥花束',
    contactName: '張小花',
    contactPhone: '0955555555',
    products: [
      {
        code: 'FL01',
        name: '小花束',
        description: '約 20cm',
        basePrice: 280,
        components: [
          { name: '加卡片', extraPrice: 30, allowCustomNote: true },
          { name: '牛皮紙包裝', extraPrice: 0, allowCustomNote: false },
        ],
      },
    ],
  },
] as const

async function ensureStall(s: (typeof STALLS)[number]) {
  await prisma.stall.upsert({
    where: { id: s.id },
    create: {
      id: s.id,
      name: s.name,
      description: s.description,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
    },
    update: {},
  })

  for (const [i, p] of s.products.entries()) {
    const product = await prisma.product.upsert({
      where: { stallId_code: { stallId: s.id, code: p.code } },
      create: {
        stallId: s.id,
        code: p.code,
        name: p.name,
        description: p.description,
        basePrice: p.basePrice,
        sortOrder: i,
      },
      update: {},
    })
    for (const [j, c] of p.components.entries()) {
      const existing = await prisma.productComponent.findFirst({
        where: { productId: product.id, name: c.name },
      })
      if (existing) continue
      await prisma.productComponent.create({
        data: {
          productId: product.id,
          name: c.name,
          extraPrice: c.extraPrice,
          allowCustomNote: c.allowCustomNote,
          sortOrder: j + 1,
        },
      })
    }
  }
}

/** 建一個場次，把指定攤商加進去、產邀請碼、上架商品 */
async function ensureMarketDay(opts: {
  id: string
  eventDate: string
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'
  deadline: Date
  stalls: readonly (typeof STALLS)[number][]
  withListings: boolean
}) {
  await prisma.marketDay.upsert({
    where: { id: opts.id },
    create: {
      id: opts.id,
      marketId: MARKET_ID,
      eventDate: isoDateToDate(opts.eventDate),
      openTime: hhmmToTime('09:00'),
      closeTime: hhmmToTime('15:00'),
      orderDeadline: opts.deadline,
      status: opts.status,
      ...(opts.status === 'CLOSED' ? { closedAt: new Date() } : {}),
    },
    update: {
      eventDate: isoDateToDate(opts.eventDate),
      orderDeadline: opts.deadline,
      status: opts.status,
    },
  })

  const expiresAt = inviteExpiresAt(isoDateToDate(opts.eventDate))
  const recyclableAt = inviteRecyclableAt(expiresAt)
  const codes: { code: string; stall: string; booth: string }[] = []

  for (const [i, s] of opts.stalls.entries()) {
    const participation = await prisma.participation.upsert({
      where: { marketDayId_stallId: { marketDayId: opts.id, stallId: s.id } },
      create: { marketDayId: opts.id, stallId: s.id, boothNo: s.booth },
      update: {},
    })

    const code = buildInviteCode('A', isoDateToDate(opts.eventDate), i + 1)
    const existing = await prisma.inviteCode.findFirst({
      where: { participationId: participation.id, status: { not: 'RECYCLED' } },
    })
    if (!existing) {
      await prisma.inviteCode.create({
        data: {
          participationId: participation.id,
          code,
          expiresAt,
          recyclableAt,
          ...(opts.status === 'CLOSED' ? { status: 'EXPIRED' as const } : {}),
        },
      })
    }
    codes.push({ code: existing?.code ?? code, stall: s.name, booth: s.booth })

    if (opts.withListings) {
      const products = await prisma.product.findMany({ where: { stallId: s.id } })
      for (const p of products) {
        await prisma.listing.upsert({
          where: { marketDayId_productId: { marketDayId: opts.id, productId: p.id } },
          create: {
            marketDayId: opts.id,
            productId: p.id,
            stallId: s.id,
            price: p.basePrice,
            maxQty: 30,
          },
          update: {},
        })
      }
    }
  }

  return codes
}

async function main(): Promise<void> {
  const today = todayInTaipei()

  await prisma.market.upsert({
    where: { id: MARKET_ID },
    create: {
      id: MARKET_ID,
      code: 'A',
      name: '運動中心週末市集',
      location: '台中市○○運動中心外場',
    },
    update: {},
  })

  for (const s of STALLS) await ensureStall(s)

  // 本週場次（可下單）：全部 5 攤
  const upcoming = await ensureMarketDay({
    id: '00000000-0000-0000-0000-0000000000d1',
    eventDate: addDaysIso(today, 3),
    status: 'PUBLISHED',
    deadline: taipeiToUtc(addDaysIso(today, 2), '22:00:00'),
    stalls: STALLS,
    withListings: true,
  })

  // 下週場次（未發布，測試 DRAFT 顧客看不到）：3 攤
  const draft = await ensureMarketDay({
    id: '00000000-0000-0000-0000-0000000000d2',
    eventDate: addDaysIso(today, 10),
    status: 'DRAFT',
    deadline: taipeiToUtc(addDaysIso(today, 9), '22:00:00'),
    stalls: STALLS.slice(0, 3),
    withListings: true,
  })

  // 上週場次（已結案，測試唯讀）：2 攤
  const closed = await ensureMarketDay({
    id: '00000000-0000-0000-0000-0000000000d3',
    eventDate: addDaysIso(today, -4),
    status: 'CLOSED',
    deadline: taipeiToUtc(addDaysIso(today, -5), '22:00:00'),
    stalls: STALLS.slice(0, 2),
    withListings: true,
  })

  const line = (label: string, codes: { code: string; stall: string; booth: string }[]) => {
    console.log(`\n${label}`)
    for (const c of codes) {
      console.log(`  ${c.code}   ${c.stall}（攤位 ${c.booth}）`)
    }
  }

  console.log('展示測資建立完成。')
  console.log(`  市集 A｜運動中心週末市集`)
  console.log(`  攤商 ${STALLS.length} 家、商品 ${STALLS.reduce((n, s) => n + s.products.length, 0)} 項`)
  line(`本週場次 ${addDaysIso(today, 3)}（PUBLISHED，可下單）邀請碼：`, upcoming)
  line(`下週場次 ${addDaysIso(today, 10)}（DRAFT，顧客看不到）邀請碼：`, draft)
  line(`上週場次 ${addDaysIso(today, -4)}（CLOSED，唯讀）邀請碼（已失效）：`, closed)
  console.log('\n把自己升成管理員：')
  console.log(
    "  docker exec market-preorder-db psql -U market -d market_preorder -c \"UPDATE app_user SET role='operator' WHERE display_name='你的名字';\"",
  )
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
