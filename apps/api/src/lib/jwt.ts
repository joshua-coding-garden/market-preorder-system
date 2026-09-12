import { SignJWT, jwtVerify } from 'jose'
import { config } from '../config.js'

const secret = new TextEncoder().encode(config.JWT_SECRET)
const ISSUER = 'market-preorder'
const AUDIENCE = 'market-preorder-web'

export interface SessionPayload {
  /** app_user.id（模擬中就是被模擬者） */
  sub: string
  /**
   * ⚠️ 規格外：身分模擬中的原始 operator id。
   * 有值代表這個 session 是模擬出來的，可以用它還原回去。
   */
  imp?: string
}

/**
 * 簽發自家 session JWT（D-11）。
 * 注意：LINE 的 access token 不放進 payload，也不交給前端。
 */
export async function signSession(
  userId: string,
  impersonatorId?: string,
): Promise<string> {
  return new SignJWT(impersonatorId ? { imp: impersonatorId } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionMaxAgeSeconds}s`)
    .sign(secret)
}

/** 驗證 session JWT；簽章錯誤／過期一律回 null（由呼叫端轉 401） */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
    return {
      sub: payload.sub,
      imp: typeof payload.imp === 'string' ? payload.imp : undefined,
    }
  } catch {
    return null
  }
}

/** OAuth state 用的短效 JWT（放在 cookie，避免另建 session store） */
export async function signOauthState(state: string, redirect: string): Promise<string> {
  return new SignJWT({ state, redirect })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience('market-preorder-oauth')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secret)
}

export async function verifyOauthState(
  token: string,
): Promise<{ state: string; redirect: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: 'market-preorder-oauth',
      algorithms: ['HS256'],
    })
    if (typeof payload.state !== 'string' || typeof payload.redirect !== 'string') {
      return null
    }
    return { state: payload.state, redirect: payload.redirect }
  } catch {
    return null
  }
}
