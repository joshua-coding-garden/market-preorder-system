import { buildApp } from './app.js'
import { config } from './config.js'
import { startJobs } from './jobs/index.js'
import { prisma } from './lib/db.js'

async function main(): Promise<void> {
  const app = await buildApp()

  // 排程（04 §G）只在真正啟動服務時開；測試直接呼叫 job 函式
  const tasks = startJobs(app.log)

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
    for (const task of tasks) task.stop()
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))

  await app.listen({ port: config.API_PORT, host: config.API_HOST })
}

main().catch((err) => {
  console.error('API 啟動失敗：', err)
  process.exit(1)
})
