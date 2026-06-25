import { EVM_WALLET_CHAINS, SOLANA_WALLET_CHAINS, TRON_WALLET_CHAINS } from './chains'
import type {
  Eip1193Provider,
  SolanaWalletProvider,
  TronWebLike,
  TronWalletProvider,
  WalletProviderByChain,
} from './types'

export function getInjectedEthereumProvider(): Eip1193Provider | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    ethereum?: Eip1193Provider
  }
  return maybeGlobal.ethereum
}

export function getInjectedTronProvider(): TronWalletProvider | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    tronLink?: {
      tronWeb?: TronWebLike
      request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T>
    }
    tronWeb?: TronWebLike
  }
  const tronWeb = maybeGlobal.tronLink?.tronWeb ?? maybeGlobal.tronWeb
  if (!tronWeb && !maybeGlobal.tronLink?.request) return undefined
  return { tronLink: maybeGlobal.tronLink, tronWeb }
}

export function getInjectedSolanaProvider(): SolanaWalletProvider | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    phantom?: { solana?: SolanaWalletProvider }
    solana?: SolanaWalletProvider
  }
  return maybeGlobal.phantom?.solana ?? maybeGlobal.solana
}

export function getInjectedWalletProviders(): WalletProviderByChain {
  const providers: WalletProviderByChain = {}
  const evmProvider = getInjectedEthereumProvider()
  if (evmProvider) {
    for (const chain of EVM_WALLET_CHAINS) providers[chain] = evmProvider
  }
  const tronProvider = getInjectedTronProvider()
  if (tronProvider) {
    for (const chain of TRON_WALLET_CHAINS) providers[chain] = tronProvider
  }
  const solanaProvider = getInjectedSolanaProvider()
  if (solanaProvider) {
    for (const chain of SOLANA_WALLET_CHAINS) providers[chain] = solanaProvider
  }
  return providers
}
