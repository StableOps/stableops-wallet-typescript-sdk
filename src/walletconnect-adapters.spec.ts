import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'
import { describe, expect, it, vi } from 'vitest'

import {
  createEvmProviderFromUniversal,
  createSolanaProviderFromUniversal,
  createTronProviderFromUniversal,
  type UniversalProviderLike,
} from './walletconnect-adapters'

type UniversalProviderMock = UniversalProviderLike & {
  request: ReturnType<typeof vi.fn>
}

function createUniversalProviderMock(response?: unknown): UniversalProviderMock {
  return {
    request: vi.fn(async () => response),
  } as unknown as UniversalProviderMock
}

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
    const universalProvider = createUniversalProviderMock('0xTXHASH')
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
      createUniversalProviderMock(),
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
    const universalProvider = createUniversalProviderMock({ transaction: signedBase64 })
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
    const universalProvider = createUniversalProviderMock({ signature: 'SOLANA_SIGNATURE' })
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
      createUniversalProviderMock({ unsupported: true }),
      'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
      'So11111111111111111111111111111111111111112',
    )

    await expect(provider.signTransaction?.(createSerializableTransaction())).rejects.toMatchObject(
      {
        code: 'wallet_provider_mismatch',
      },
    )
  })

  it('signs TRON transactions through UniversalProvider with the default nested params shape', async () => {
    const universalProvider = createUniversalProviderMock({ txID: 'SIGNED_TX' })
    const provider = createTronProviderFromUniversal(
      universalProvider,
      'tron:0xcd8690dc',
      'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
    )

    const signed = await provider.signTransaction({ raw_data: { foo: 'bar' } })

    expect(signed).toEqual({ txID: 'SIGNED_TX' })
    expect(universalProvider.request).toHaveBeenCalledWith(
      {
        method: 'tron_signTransaction',
        params: {
          address: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
          transaction: { transaction: { raw_data: { foo: 'bar' } } },
        },
      },
      'tron:0xcd8690dc',
    )
  })

  it('unwraps a { result } envelope from the TRON sign response', async () => {
    const universalProvider = createUniversalProviderMock({ result: { txID: 'INNER' } })
    const provider = createTronProviderFromUniversal(
      universalProvider,
      'tron:0x2b6653dc',
      'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
    )

    await expect(provider.signTransaction({ raw_data: {} })).resolves.toEqual({ txID: 'INNER' })
  })

  it('uses the flat v1 params shape when the session advertises tron_method_version v1', async () => {
    const universalProvider = {
      request: vi.fn(async () => ({ txID: 'SIGNED_TX' })),
      session: { sessionProperties: { tron_method_version: 'v1' } },
    } as unknown as UniversalProviderMock
    const provider = createTronProviderFromUniversal(
      universalProvider,
      'tron:0x2b6653dc',
      'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
    )

    await provider.signTransaction({ raw_data: { foo: 'bar' } })

    expect(universalProvider.request).toHaveBeenCalledWith(
      {
        method: 'tron_signTransaction',
        params: {
          address: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
          transaction: { raw_data: { foo: 'bar' } },
        },
      },
      'tron:0x2b6653dc',
    )
  })

  it('throws a wallet mismatch error when the TRON sign response is empty', async () => {
    const provider = createTronProviderFromUniversal(
      createUniversalProviderMock(null),
      'tron:0xcd8690dc',
      'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
    )

    await expect(provider.signTransaction({ raw_data: {} })).rejects.toMatchObject({
      code: 'wallet_provider_mismatch',
    })
  })
})
