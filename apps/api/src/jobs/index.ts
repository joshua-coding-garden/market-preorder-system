import type { FastifyBaseLogger } from 'fastify'
import cron, { type ScheduledTask } from 'node-cron'
import { config } from '../config.js'
import { pickupReminder } from '../modules/line/notificationService.js'
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
    // 當日取貨提醒（Q-06 預設 08:00 台北，可用 PICKUP_REMINDER_HOUR 調整）
    cron.schedule(
      `0 ${config.PICKUP_REMINDER_HOUR} * * *`,
      run('pickupReminder', () => pickupReminder()),
      { timezone: TIMEZONE },
    ),
  ]

  log.info(
    { jobs: ['inviteExpire', 'inviteRecycle', 'pickupReminder'] },
    'scheduled jobs started',
  )
  return tasks
}
