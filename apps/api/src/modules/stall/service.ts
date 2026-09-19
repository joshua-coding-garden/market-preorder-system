import type {
  CreateParticipationInput,
  CreateStallInput,
  UpdateStallInput,
  UpdateStallSelfInput,
} from '@market/shared'
import { prisma } from '../../lib/db.js'
import { AppError, notFound } from '../../lib/errors.js'
import { isUniqueViolation, issueInviteCode } from '../../lib/inviteCode.js'
import { getSettings } from '../../lib/settings.js'
import { dateToIsoDate, timeToHhmm } from '../../lib/time.js'
import { assertMarketDayWritable } from '../market/service.js'

// ---------------------------------------------------------------- 廠商：攤商

export async function listStalls() {
  const stalls = await prisma.stall.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { members: true } },
      members: { include: { user: { select: { id: true, displayName: true } } } },
    },
  })
  return stalls.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    contactName: s.contactName,
    contactPhone: s.contactPhone,
    logoUrl: s.logoUrl,
    isActive: s.isActive,
    memberCount: s._count.members,
    members: s.members.map((m) => ({ id: m.user.id, displayName: m.user.displayName })),
  }))
}

export async function createStall(input: CreateStallInput) {
  // ⚠️ 規格外（2026-09-20 指示）：全站攤商數上限。
  // 只算啟用中的——停用的攤位等於騰出來了。
  const { maxStalls } = await getSettings()
  const active = await prisma.stall.count({ where: { isActive: true } })
  if (active >= maxStalls) {
    throw new AppError(
      'STALL_LIMIT_REACHED',
      `攤商數已達上限 ${maxStalls} 攤，請先停用不再參與的攤商，或到系統設定調高上限`,
    )
  }

  const stall = await prisma.stall.create({ data: input })
  return { ...stall, memberCount: 0, members: [] }
}

export async function updateStall(id: string, input: UpdateStallInput) {
  const existing = await prisma.stall.findUnique({ where: { id } })
  if (!existing) throw notFound('找不到攤商')
  const stall = await prisma.stall.update({ where: { id }, data: input })
  return stall
}

/**
 * ⚠️ 規格外（委託方 2026-09-20 指示）：攤商自己看／改基本資料。
 * 權限在 route 上用 assertStallMember 擋；這裡只負責欄位。
 */
export async function getStallProfile(stallId: string) {
  const stall = await prisma.stall.findUnique({ where: { id: stallId } })
  if (!stall) throw notFound('找不到攤商')
  return {
    id: stall.id,
    name: stall.name,
    description: stall.description,
    contactName: stall.contactName,
    contactPhone: stall.contactPhone,
    logoUrl: stall.logoUrl,
    isActive: stall.isActive,
  }
}

export async function updateStallProfile(stallId: string, input: UpdateStallSelfInput) {
  const stall = await prisma.stall.findUnique({ where: { id: stallId } })
  if (!stall) throw notFound('找不到攤商')
  if (!stall.isActive) {
    throw new AppError('CONFLICT', '這個攤商已被停用，請聯絡主辦單位')
  }
  await prisma.stall.update({ where: { id: stallId }, data: input })
  return getStallProfile(stallId)
}

// ---------------------------------------------------------------- 廠商：參與與邀請碼

function serializeInvite(code: {
  id: string
  code: string
  status: string
  expiresAt: Date
  recyclableAt: Date
  redeemedAt: Date | null
}) {
  return {
    id: code.id,
    code: code.code,
    status: code.status,
    expiresAt: code.expiresAt.toISOString(),
    recyclableAt: code.recyclableAt.toISOString(),
    redeemedAt: code.redeemedAt?.toISOString() ?? null,
  }
}

/** GET /operator/market-days/:id/participations：含各自目前 ACTIVE 邀請碼 */
export async function listParticipations(marketDayId: string) {
  const day = await prisma.marketDay.findUnique({ where: { id: marketDayId } })
  if (!day) throw notFound('找不到場次')

  const participations = await prisma.participation.findMany({
    where: { marketDayId },
    orderBy: { boothNo: 'asc' },
    include: {
      stall: { select: { id: true, name: true, _count: { select: { members: true } } } },
      inviteCodes: { orderBy: { createdAt: 'desc' } },
    },
  })

  return participations.map((p) => {
    // 目前有效的那一張；沒有就顯示最後一張的狀態
    const active = p.inviteCodes.find((c) => c.status === 'ACTIVE')
    const latest = active ?? p.inviteCodes[0]
    return {
      id: p.id,
      boothNo: p.boothNo,
      stall: { id: p.stall.id, name: p.stall.name },
      memberCount: p.stall._count.members,
      inviteCode: latest ? serializeInvite(latest) : null,
    }
  })
}

/** POST /operator/market-days/:id/participations：建 participation 並自動產生邀請碼 */
export async function createParticipation(
  marketDayId: string,
  input: CreateParticipationInput,
) {
  await assertMarketDayWritable(marketDayId)

  const stall = await prisma.stall.findUnique({ where: { id: input.stallId } })
  if (!stall) throw notFound('找不到攤商')

  return prisma.$transaction(async (tx) => {
    let participation
    try {
      participation = await tx.participation.create({
        data: { marketDayId, stallId: input.stallId, boothNo: input.boothNo },
      })
    } catch (err) {
      if (isUniqueViolation(err, 'booth_no')) {
        throw new AppError('CONFLICT', `攤位 ${input.boothNo} 在這個場次已經被使用`)
      }
      if (isUniqueViolation(err)) {
        throw new AppError('CONFLICT', '這個攤商已經參加這個場次了')
      }
      throw err
    }

    const invite = await issueInviteCode(tx, participation.id)
    return {
      participation: {
        id: participation.id,
        boothNo: participation.boothNo,
        stall: { id: stall.id, name: stall.name },
        memberCount: 0,
      },
      inviteCode: serializeInvite(invite),
    }
  })
}

export async function updateParticipation(id: string, boothNo: string) {
  const participation = await prisma.participation.findUnique({ where: { id } })
  if (!participation) throw notFound('找不到參與資料')
  await assertMarketDayWritable(participation.marketDayId)

  try {
    const updated = await prisma.participation.update({ where: { id }, data: { boothNo } })
    return { id: updated.id, boothNo: updated.boothNo }
  } catch (err) {
    if (isUniqueViolation(err, 'booth_no')) {
      throw new AppError('CONFLICT', `攤位 ${boothNo} 在這個場次已經被使用`)
    }
    throw err
  }
}

/** DELETE /operator/participations/:id：該攤在該場已有子單則 409 */
export async function deleteParticipation(id: string): Promise<void> {
  const participation = await prisma.participation.findUnique({ where: { id } })
  if (!participation) throw notFound('找不到參與資料')
  await assertMarketDayWritable(participation.marketDayId)

  const subOrderCount = await prisma.subOrder.count({
    where: { marketDayId: participation.marketDayId, stallId: participation.stallId },
  })
  if (subOrderCount > 0) {
    throw new AppError('CONFLICT', '這個攤商在本場已經有訂單，不能移除')
  }

  await prisma.participation.delete({ where: { id } })
}

/** POST /operator/participations/:id/invite-codes/reissue：舊碼 EXPIRED，發新碼 */
export async function reissueInviteCode(participationId: string) {
  const participation = await prisma.participation.findUnique({
    where: { id: participationId },
  })
  if (!participation) throw notFound('找不到參與資料')
  await assertMarketDayWritable(participation.marketDayId)

  return prisma.$transaction(async (tx) => {
    await tx.inviteCode.updateMany({
      where: { participationId, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    })
    const invite = await issueInviteCode(tx, participationId)
    return serializeInvite(invite)
  })
}

// ---------------------------------------------------------------- 邀請碼兌換

/**
 * 兌換邀請碼（04 §C）。網頁端與 LINE Bot 共用這一個 service。
 *
 * 找不到／過期／已兌換三種情況對外訊息完全相同（S1-6、S1-7），
 * 只在伺服器 log 記錄實際原因。
 */
export async function redeemInvite(
  userId: string,
  rawCode: string,
): Promise<{
  stall: { id: string; name: string }
  marketDay: { id: string; eventDate: string; openTime: string; closeTime: string }
  boothNo: string
  reason?: string
}> {
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, '')

  const invite = await prisma.inviteCode.findFirst({
    where: { code },
    orderBy: { createdAt: 'desc' },
    include: {
      participation: {
        include: { stall: true, marketDay: true },
      },
    },
  })

  const invalid = (reason: string) => {
    const err = new AppError('INVITE_INVALID', '邀請碼無效或已使用')
    // 供伺服器 log 判讀，不會回給前端
    ;(err as AppError & { reason?: string }).reason = reason
    return err
  }

  if (!invite) throw invalid('NOT_FOUND')
  if (invite.status !== 'ACTIVE') throw invalid(`STATUS_${invite.status}`)
  if (invite.expiresAt.getTime() < Date.now()) throw invalid('EXPIRED_AT_CHECK')

  const { participation } = invite

  await prisma.$transaction(async (tx) => {
    // 併發保護：只有把 ACTIVE 改成 REDEEMED 成功的那一筆才算兌換成功
    const claimed = await tx.inviteCode.updateMany({
      where: { id: invite.id, status: 'ACTIVE' },
      data: { status: 'REDEEMED', redeemedByUserId: userId, redeemedAt: new Date() },
    })
    if (claimed.count === 0) throw invalid('RACE_LOST')

    await tx.stallMember.upsert({
      where: { userId_stallId: { userId, stallId: participation.stallId } },
      create: { userId, stallId: participation.stallId },
      update: {},
    })
  })

  return {
    stall: { id: participation.stall.id, name: participation.stall.name },
    marketDay: {
      id: participation.marketDay.id,
      eventDate: dateToIsoDate(participation.marketDay.eventDate),
      openTime: timeToHhmm(participation.marketDay.openTime),
      closeTime: timeToHhmm(participation.marketDay.closeTime),
    },
    boothNo: participation.boothNo,
  }
}

// ---------------------------------------------------------------- 攤商端

/** GET /stalls/:stallId/market-days：該攤參與過／即將參與的場次 */
export async function listStallMarketDays(stallId: string) {
  const participations = await prisma.participation.findMany({
    where: { stallId },
    include: { marketDay: { include: { market: true } } },
    orderBy: { marketDay: { eventDate: 'desc' } },
  })

  return participations.map((p) => ({
    participationId: p.id,
    boothNo: p.boothNo,
    marketDay: {
      id: p.marketDay.id,
      eventDate: dateToIsoDate(p.marketDay.eventDate),
      openTime: timeToHhmm(p.marketDay.openTime),
      closeTime: timeToHhmm(p.marketDay.closeTime),
      orderDeadline: p.marketDay.orderDeadline.toISOString(),
      status: p.marketDay.status,
      market: { id: p.marketDay.market.id, name: p.marketDay.market.name },
    },
  }))
}
