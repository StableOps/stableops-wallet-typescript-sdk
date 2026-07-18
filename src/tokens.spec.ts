import { describe, expect, it } from 'vitest'

import { WALLET_TOKEN_CONTRACTS } from './tokens'

describe('WALLET_TOKEN_CONTRACTS', () => {
  it('EVM 合约地址一律小写存储（与 shared 的 normalizeContractAddress 约定一致）', () => {
    for (const entry of WALLET_TOKEN_CONTRACTS) {
      if (entry.address.startsWith('0x')) {
        expect(entry.address, `${entry.chain} ${entry.asset}`).toBe(entry.address.toLowerCase())
      }
    }
  })

  it('同链同资产不重复', () => {
    const seen = new Set<string>()
    for (const entry of WALLET_TOKEN_CONTRACTS) {
      const key = `${entry.chain}:${entry.asset}`
      expect(seen.has(key), key).toBe(false)
      seen.add(key)
    }
  })
})
