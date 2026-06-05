import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  // 大型钱包运行时保持 external，由消费者依赖解析。
  external: ['@solana/web3.js'],
})
