import type { FastifyBaseLogger } from 'fastify'
import cron, { type ScheduledTask } from 'node-cron'
import { inviteExpire, inviteRecycle } from './inviteJobs.js'

/**
 * 排程總表（04 §G）。全部以 Asia/Taipei 為時區。
 * 測試環境不啟動排程；job 本身可獨立匯入呼叫。
 */
const TIMEZONE = 'Asia/Taipei'

export function startJobs(log: FastifyBaseLogger): ScheduledTask[] {
  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      const result = await fn()
      log.info({ job: name, result }, 'job finished')
    } catch (err) {
      log.error({ job: name, err }, 'job failed')
    }
  }

  const tasks = [
    cron.schedule('0 * * * *', run('inviteExpire', () => inviteExpire()), {
      timezone: TIMEZONE,
    }),
    cron.schedule('0 3 * * *', run('inviteRecycle', () => inviteRecycle()), {
      timezone: TIMEZONE,
    }),
  ]

  log.info({ jobs: ['inviteExpire', 'inviteRecycle'] }, 'scheduled jobs started')
  return tasks
}
