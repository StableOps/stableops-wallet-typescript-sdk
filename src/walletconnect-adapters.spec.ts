import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'

import {
  createEvmProviderFromUniversal,
  createSolanaProviderFromUniversal,
} from './walletconnect-adapters'

function createSerializableTransaction(): Transaction {
  const payer = Keypair.generate().publicKey
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: '11111111111111111111111111111111',
  })
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: payer,
      lamports: 0,
    }),
  )
  return transaction
}

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

  it('exposes a Solana public key from the session account', async () => {
    const provider = createSolanaProviderFromUniversal(
      { request: vi.fn() },
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      'So11111111111111111111111111111111111111112',
    )

    await expect(provider.connect?.()).resolves.toEqual({
      publicKey: 'So11111111111111111111111111111111111111112',
    })
    expect(provider.publicKey).toBe('So11111111111111111111111111111111111111112')
  })

  it('signs Solana transactions through UniversalProvider and restores signed transactions', async () => {
    const signed = createSerializableTransaction()
    const signedBase64 = Buffer.from(
      signed.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString('base64')
    const universalProvider = {
      request: vi.fn(async () => ({ transaction: signedBase64 })),
    }
    const provider = createSolanaProviderFromUniversal(
      universalProvider,
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      'So11111111111111111111111111111111111111112',
    )

    const result = await provider.signTransaction?.(createSerializableTransaction())

    expect(result).toBeInstanceOf(Transaction)
    expect(universalProvider.request).toHaveBeenCalledWith(
      {
        method: 'solana_signTransaction',
        params: { transaction: expect.any(String) },
      },
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    )
  })

  it('parses Solana signAndSendTransaction signature responses', async () => {
    const universalProvider = {
      request: vi.fn(async () => ({ signature: 'SOLANA_SIGNATURE' })),
    }
    const provider = createSolanaProviderFromUniversal(
      universalProvider,
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      'So11111111111111111111111111111111111111112',
    )

    await expect(provider.signAndSendTransaction?.(createSerializableTransaction())).resolves.toBe(
      'SOLANA_SIGNATURE',
    )
  })

  it('throws a wallet mismatch error for unsupported Solana signed transaction responses', async () => {
    const provider = createSolanaProviderFromUniversal(
      { request: vi.fn(async () => ({ unsupported: true })) },
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      'So11111111111111111111111111111111111111112',
    )

    await expect(provider.signTransaction?.(createSerializableTransaction())).rejects.toMatchObject(
      {
        code: 'wallet_provider_mismatch',
      },
    )
  })
})
