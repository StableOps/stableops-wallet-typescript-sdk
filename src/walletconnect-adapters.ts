import type { Eip1193Provider } from './types'
import { StableOpsWalletError } from './errors'
import { loadSolanaWeb3 } from './lazy'
import type { SolanaWalletProvider } from './types'

export type UniversalProviderLike = {
  request<T = unknown>(
    args: {
      method: string
      params?: unknown[] | Record<string, unknown>
    },
    chainId?: string,
  ): Promise<T>
}

export function createEvmProviderFromUniversal(
  provider: UniversalProviderLike,
  chainId: string,
): Eip1193Provider {
  return {
    request(args) {
      return provider.request(args, chainId)
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const maybeBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(bytes: Uint8Array): { toString(encoding: 'base64'): string } }
  }
  if (maybeBuffer.Buffer) return maybeBuffer.Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return globalThis.btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const maybeBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: 'base64'): Uint8Array }
  }
  if (maybeBuffer.Buffer) return maybeBuffer.Buffer.from(base64, 'base64')
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function getStringField(response: unknown, field: string): string | undefined {
  if (typeof response !== 'object' || response === null) return undefined
  const value = (response as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

function parseSignedTransactionBase64(response: unknown): string {
  if (typeof response === 'string') return response
  const transaction =
    getStringField(response, 'transaction') ?? getStringField(response, 'signedTransaction')
  if (transaction) return transaction
  throw new StableOpsWalletError(
    'Solana wallet did not return a signed transaction',
    'wallet_provider_mismatch',
    response,
  )
}

function parseSignature(response: unknown): string {
  if (typeof response === 'string') return response
  const signature = getStringField(response, 'signature')
  if (signature) return signature
  throw new StableOpsWalletError(
    'Solana wallet did not return a transaction signature',
    'wallet_transaction_hash_not_found',
    response,
  )
}

export function createSolanaProviderFromUniversal(
  provider: UniversalProviderLike,
  chainId: string,
  account: string,
): SolanaWalletProvider {
  return {
    publicKey: account,
    async connect() {
      return { publicKey: account }
    },
    async signTransaction(transaction) {
      const web3 = await loadSolanaWeb3()
      const serialized = bytesToBase64(
        transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      )
      const response = await provider.request(
        {
          method: 'solana_signTransaction',
          params: { transaction: serialized },
        },
        chainId,
      )
      return web3.Transaction.from(base64ToBytes(parseSignedTransactionBase64(response)))
    },
    async signAndSendTransaction(transaction) {
      const serialized = bytesToBase64(
        transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      )
      const response = await provider.request(
        {
          method: 'solana_signAndSendTransaction',
          params: { transaction: serialized },
        },
        chainId,
      )
      return parseSignature(response)
    },
  }
}

export type WalletConnectUnsupportedTronProvider = {
  walletConnectTron: true
  chainId: 'tron:0x2b6653dc' | 'tron:0xcd8690dc'
  account: string
  request<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
}

export function createTronProviderFromUniversal(
  _provider: UniversalProviderLike,
  chainId: 'tron:0x2b6653dc' | 'tron:0xcd8690dc',
  account: string,
): WalletConnectUnsupportedTronProvider {
  return {
    walletConnectTron: true,
    chainId,
    account,
    async request() {
      throw new StableOpsWalletError(
        'TRON WalletConnect payments are not supported until transaction construction, signing, and broadcast are verified for a target wallet',
        'walletconnect_tron_unsupported',
      )
    },
  }
}
