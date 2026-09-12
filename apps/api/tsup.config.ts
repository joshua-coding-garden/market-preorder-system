import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // workspace 套件以原始碼形式發佈，打包時一併 bundle 進來
  noExternal: ['@market/shared'],
})
