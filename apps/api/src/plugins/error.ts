import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { ZodError } from 'zod'
import type { ApiErrorBody } from '@market/shared'
import { AppError } from '../lib/errors.js'

/**
 * 統一錯誤回應（03 §前言、§12）：
 *   { error, message?, issues? }
 * 403 回應體不得含任何目標資源資料。
 */
const errorPlugin: FastifyPluginAsync = async (app) => {
  app.setNotFoundHandler((req, reply) => {
    const body: ApiErrorBody = { error: 'NOT_FOUND', message: '找不到資料' }
    reply.code(404).send(body)
  })

  app.setErrorHandler((rawError, req, reply) => {
    // Fastify 把 error 型別開放成 unknown，這裡各取所需
    const fastifyError = rawError as { statusCode?: number; message?: string }
    const err: unknown = rawError

    if (err instanceof AppError) {
      const body: ApiErrorBody = {
        error: err.code,
        message: err.message,
        ...err.extra,
      }
      reply.code(err.statusCode).send(body)
      return
    }

    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        error: 'VALIDATION',
        message: '輸入內容有誤',
        issues: err.issues,
      }
      reply.code(400).send(body)
      return
    }

    // Fastify 自身的驗證／解析錯誤
    if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
      const body: ApiErrorBody = {
        error: fastifyError.statusCode === 400 ? 'VALIDATION' : 'CONFLICT',
        message: fastifyError.message,
      }
      reply.code(fastifyError.statusCode).send(body)
      return
    }

    req.log.error({ err }, 'unhandled error')
    reply.code(500).send({ error: 'INTERNAL', message: '發生錯誤，請稍後再試' })
  })
}

export default fp(errorPlugin, { name: 'error' })
