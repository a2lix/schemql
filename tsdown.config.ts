import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/adapters/*.ts'],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  clean: true,
  dts: true,
  minify: true,
  // Ensure we don't bundle dependencies like Zod, ArkType, BetterSqlite3, etc.
  deps: {
    noBundle: true,
    neverBundle: ['@cloudflare/workers-types'],
  },
})
