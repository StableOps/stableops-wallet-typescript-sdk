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

// 测试侧 base58 编码（Solana 字典），用于构造旧规范钱包返回的 { signature } 响应。
function bytesToBase58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let index = 0; index < digits.length; index++) {
      carry += digits[index]! << 8
      digits[index] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let encoded = ''
  for (const byte of bytes) {
    if (byte !== 0) break
    encoded += '1'
  }
  for (let index = digits.length - 1; index >= 0; index--) {
    encoded += alphabet[digits[index]!]
  }
  return encoded
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

  it('兼容旧规范只返回 { signature }（base58）的钱包：把签名挂回原交易', async () => {
    const payer = Keypair.generate()
    const buildTransaction = () => {
      const transaction = new Transaction({
        feePayer: payer.publicKey,
        recentBlockhash: '11111111111111111111111111111111',
      })
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: payer.publicKey,
          lamports: 0,
        }),
      )
      return transaction
    }
    // 钱包对同一份消息真实签名后只返回 base58 签名。
    const signedByWallet = buildTransaction()
    signedByWallet.sign(payer)
    const universalProvider = createUniversalProviderMock({
      signature: bytesToBase58(signedByWallet.signature!),
    })
    const provider = createSolanaProviderFromUniversal(
      universalProvider,
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      payer.publicKey.toBase58(),
    )

    const result = await provider.signTransaction?.(buildTransaction())

    expect(result).toBeInstanceOf(Transaction)
    expect(result!.signatures[0]?.publicKey.equals(payer.publicKey)).toBe(true)
    // 附回的签名能通过完整序列化校验（verifySignatures 默认开启）。
    expect(() => result!.serialize()).not.toThrow()
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
