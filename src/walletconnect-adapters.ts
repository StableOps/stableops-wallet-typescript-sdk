import type {
  Eip1193Provider,
  SolanaWalletProvider,
  WalletConnectTronChainId,
  WalletConnectTronProvider,
} from './types'
import { StableOpsWalletError } from './errors'
import { loadSolanaWeb3 } from './lazy'

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

// universal-provider 在 connect 后可能带有 sessionProperties;部分钱包用
// tron_method_version 标记 tron_signTransaction 的 params 形状(v1 与默认不同)。
type TronUniversalProvider = UniversalProviderLike & {
  session?: { sessionProperties?: Record<string, unknown> }
}

// 从 tron_signTransaction 的返回里取出已签名交易:部分钱包包了一层 { result }。
function unwrapSignedTronTransaction(response: unknown): unknown {
  if (response && typeof response === 'object' && 'result' in response) {
    const inner = (response as { result?: unknown }).result
    if (inner != null) return inner
  }
  return response
}

// 通过 WalletConnect(universal-provider)对 TRON 交易签名。
// 与官方库 @tronweb3/walletconnect-tron 发送的请求保持一致:
//   method: tron_signTransaction
//   params: v1 → { address, transaction };默认 → { address, transaction: { transaction } }
// 仅签名,不广播——交易构造与广播由 tron.ts 用 tronweb 完成。
export function createTronProviderFromUniversal(
  provider: UniversalProviderLike,
  chainId: WalletConnectTronChainId,
  account: string,
): WalletConnectTronProvider {
  return {
    walletConnectTron: true,
    chainId,
    account,
    async signTransaction(transaction) {
      const sessionProperties = (provider as TronUniversalProvider).session?.sessionProperties
      const isV1 = sessionProperties?.tron_method_version === 'v1'
      const params = isV1
        ? { address: account, transaction }
        : { address: account, transaction: { transaction } }
      const response = await provider.request(
        { method: 'tron_signTransaction', params },
        chainId,
      )
      const signed = unwrapSignedTronTransaction(response)
      if (signed == null) {
        throw new StableOpsWalletError(
          'TRON WalletConnect wallet did not return a signed transaction',
          'wallet_provider_mismatch',
          response,
        )
      }
      return signed
    },
  }
}
