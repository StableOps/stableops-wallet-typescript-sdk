import { describe, expect, it } from 'vitest'

import {
  fromWalletConnectChainId,
  getAuthorizedWalletChains,
  parseWalletConnectAccount,
  toWalletConnectChainId,
} from './walletconnect-caip'

describe('walletconnect CAIP helpers', () => {
  it('maps StableOps chain ids to WalletConnect CAIP-2 chain ids', () => {
    expect(toWalletConnectChainId('base')).toBe('eip155:8453')
    expect(toWalletConnectChainId('solana')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    )
    expect(toWalletConnectChainId('solana-devnet')).toBe(
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    )
    expect(toWalletConnectChainId('tron')).toBe('tron:0x2b6653dc')
    expect(toWalletConnectChainId('tron-nile')).toBe('tron:0xcd8690dc')
  })

  it('maps WalletConnect CAIP-2 chain ids back to StableOps chain ids', () => {
    expect(fromWalletConnectChainId('eip155:8453')).toBe('base')
    expect(fromWalletConnectChainId('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1')).toBe(
      'solana-devnet',
    )
    expect(fromWalletConnectChainId('tron:0xcd8690dc')).toBe('tron-nile')
    expect(fromWalletConnectChainId('cosmos:cosmoshub-4')).toBeUndefined()
  })

  it('parses CAIP-10 account strings', () => {
    expect(parseWalletConnectAccount('eip155:8453:0xabc')).toEqual({
      namespace: 'eip155',
      reference: '8453',
      chainId: 'eip155:8453',
      accountAddress: '0xabc',
    })
  })

  it('derives authorized chains from namespace chains and accounts', () => {
    const authorized = getAuthorizedWalletChains({
      eip155: {
        chains: ['eip155:8453'],
        accounts: ['eip155:1:0xabc'],
      },
      solana: {
        accounts: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:So11111111111111111111111111111111111111112',
        ],
      },
      tron: {
        chains: ['tron:0xcd8690dc'],
        accounts: [],
      },
    })

    expect(authorized).toEqual(new Set(['base', 'ethereum', 'solana-devnet', 'tron-nile']))
  })
})
