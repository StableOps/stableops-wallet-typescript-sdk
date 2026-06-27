import { describe, expect, it, vi } from 'vitest'

vi.mock('@walletconnect/universal-provider', () => {
  throw new Error('Cannot find module @walletconnect/universal-provider')
})

describe('createWalletConnectController missing dependency', () => {
  it('throws walletconnect_dependency_missing when the optional peer is not installed', async () => {
    const { createWalletConnectController } = await import('./walletconnect')
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: {
        name: 'StableOps Test',
        description: 'WalletConnect test app',
        url: 'https://example.com',
        icons: ['https://example.com/icon.png'],
      },
    })

    await expect(controller.connect()).rejects.toMatchObject({
      code: 'walletconnect_dependency_missing',
    })
  })
})
