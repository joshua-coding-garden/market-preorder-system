import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { loadTestEnv } from './env.js'

/**
 * 測試啟動前：把 migration 套用到測試資料庫（含手寫的 CHECK 與 partial index）。
 */
export default function setup(): void {
  loadTestEnv()
  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js')

  execFileSync('node', [prismaCli, 'migrate', 'deploy'], {
    cwd: apiDir,
    stdio: 'inherit',
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  })
}
