import { buildApp } from './app.js'
import { config } from './config.js'
import { prisma } from './lib/db.js'

async function main(): Promise<void> {
  const app = await buildApp()

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
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
