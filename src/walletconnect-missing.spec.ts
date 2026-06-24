import { describe, expect, it, vi } from 'vitest'

// 模拟「可选 peer 依赖未安装」:让 dynamic import 直接抛错。
// 与 walletconnect.spec.ts 分文件,避免污染其它用例的正常 mock。
vi.mock('@walletconnect/ethereum-provider', () => {
  throw new Error('Cannot find module @walletconnect/ethereum-provider')
})

import { createWalletConnectConnection } from './index'

describe('createWalletConnectConnection — 依赖缺失', () => {
  it('@walletconnect/ethereum-provider 未安装时,connect 抛 walletconnect_dependency_missing', async () => {
    const conn = await createWalletConnectConnection({
      projectId: 'pid',
      metadata: {
        name: 'Test',
        description: 'spec',
        url: 'https://example.com',
        icons: ['https://example.com/icon.png'],
      },
    })

    await expect(conn.connect()).rejects.toMatchObject({
      code: 'walletconnect_dependency_missing',
    })
  })
})
