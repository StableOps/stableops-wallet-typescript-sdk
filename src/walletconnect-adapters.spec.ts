import { describe, expect, it, vi } from 'vitest'

import { createEvmProviderFromUniversal } from './walletconnect-adapters'

describe('walletconnect adapters', () => {
  it('routes EVM requests through UniversalProvider with a CAIP-2 chain argument', async () => {
    const universalProvider = {
      request: vi.fn(async () => '0xTXHASH'),
    }
    const provider = createEvmProviderFromUniversal(universalProvider, 'eip155:8453')

    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ to: '0xabc' }],
    })

    expect(result).toBe('0xTXHASH')
    expect(universalProvider.request).toHaveBeenCalledWith(
      {
        method: 'eth_sendTransaction',
        params: [{ to: '0xabc' }],
      },
      'eip155:8453',
    )
  })
})
