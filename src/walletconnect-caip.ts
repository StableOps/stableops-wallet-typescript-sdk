import { EvmWalletChainConfigs } from './chains'
import type { ChainId } from './types'

export type WalletConnectNamespaceSession = {
  chains?: string[]
  accounts?: string[]
  methods?: string[]
  events?: string[]
}

export type WalletConnectSessionNamespaces = Record<string, WalletConnectNamespaceSession>

export type ParsedWalletConnectAccount = {
  namespace: string
  reference: string
  chainId: string
  accountAddress: string
}

const SOLANA_CHAIN_IDS = {
  solana: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'solana-devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
} as const

const TRON_CHAIN_IDS = {
  tron: 'tron:0x2b6653dc',
  'tron-nile': 'tron:0xcd8690dc',
} as const

export function toWalletConnectChainId(chain: ChainId): string {
  if (chain in EvmWalletChainConfigs) {
    return `eip155:${EvmWalletChainConfigs[chain as keyof typeof EvmWalletChainConfigs].eip155ChainId}`
  }
  if (chain in SOLANA_CHAIN_IDS) {
    return SOLANA_CHAIN_IDS[chain as keyof typeof SOLANA_CHAIN_IDS]
  }
  if (chain in TRON_CHAIN_IDS) {
    return TRON_CHAIN_IDS[chain as keyof typeof TRON_CHAIN_IDS]
  }
  return chain
}

export function fromWalletConnectChainId(caip2: string): ChainId | undefined {
  for (const config of Object.values(EvmWalletChainConfigs)) {
    if (`eip155:${config.eip155ChainId}` === caip2) return config.chainId
  }
  for (const [chain, chainId] of Object.entries(SOLANA_CHAIN_IDS)) {
    if (chainId === caip2) return chain as ChainId
  }
  for (const [chain, chainId] of Object.entries(TRON_CHAIN_IDS)) {
    if (chainId === caip2) return chain as ChainId
  }
  return undefined
}

export function parseWalletConnectAccount(account: string): ParsedWalletConnectAccount | undefined {
  const parts = account.split(':')
  if (parts.length < 3) return undefined
  const [namespace, reference, ...addressParts] = parts
  if (!namespace || !reference || addressParts.length === 0) return undefined
  return {
    namespace,
    reference,
    chainId: `${namespace}:${reference}`,
    accountAddress: addressParts.join(':'),
  }
}

export function getAuthorizedWalletChains(namespaces: WalletConnectSessionNamespaces): Set<ChainId> {
  const authorized = new Set<ChainId>()
  for (const namespace of Object.values(namespaces)) {
    for (const chainId of namespace.chains ?? []) {
      const chain = fromWalletConnectChainId(chainId)
      if (chain) authorized.add(chain)
    }
    for (const account of namespace.accounts ?? []) {
      const parsed = parseWalletConnectAccount(account)
      if (!parsed) continue
      const chain = fromWalletConnectChainId(parsed.chainId)
      if (chain) authorized.add(chain)
    }
  }
  return authorized
}
