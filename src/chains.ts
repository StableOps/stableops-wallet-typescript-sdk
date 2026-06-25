import type { ChainId, EvmWalletChainConfig, EvmWalletChainId } from './types'

export const EVM_WALLET_CHAINS = [
  'ethereum',
  'base',
  'base-sepolia',
  'arbitrum',
  'polygon',
  'optimism',
  'bsc',
  'bsc-testnet',
  'ethereum-sepolia',
  'arbitrum-sepolia',
  'polygon-amoy',
  'optimism-sepolia',
] as const

export const TRON_WALLET_CHAINS = ['tron', 'tron-nile'] as const

export const SOLANA_WALLET_CHAINS = ['solana', 'solana-devnet'] as const

export const ERC20_TRANSFER_SELECTOR = 'a9059cbb'

export const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'
export const SOLANA_TOKEN_PROGRAM_ID_BASE58 = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID_BASE58 = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
export const SOLANA_TRANSFER_CHECKED_INSTRUCTION = 12
export const SOLANA_CREATE_ASSOCIATED_TOKEN_ACCOUNT_IDEMPOTENT_INSTRUCTION = 1

export const EvmWalletChainConfigs: Readonly<Record<EvmWalletChainId, EvmWalletChainConfig>> = {
  ethereum: {
    chainId: 'ethereum',
    eip155ChainId: 1,
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://cloudflare-eth.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  base: {
    chainId: 'base',
    eip155ChainId: 8453,
    chainName: 'Base',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  'base-sepolia': {
    chainId: 'base-sepolia',
    eip155ChainId: 84532,
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
  arbitrum: {
    chainId: 'arbitrum',
    eip155ChainId: 42161,
    chainName: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io'],
  },
  polygon: {
    chainId: 'polygon',
    eip155ChainId: 137,
    chainName: 'Polygon',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
  },
  optimism: {
    chainId: 'optimism',
    eip155ChainId: 10,
    chainName: 'OP Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.optimism.io'],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
  },
  bsc: {
    chainId: 'bsc',
    eip155ChainId: 56,
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-rpc.publicnode.com'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  'bsc-testnet': {
    chainId: 'bsc-testnet',
    eip155ChainId: 97,
    chainName: 'BNB Smart Chain Testnet',
    nativeCurrency: { name: 'tBNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-testnet-rpc.publicnode.com'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
  'ethereum-sepolia': {
    chainId: 'ethereum-sepolia',
    eip155ChainId: 11155111,
    chainName: 'Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
  'arbitrum-sepolia': {
    chainId: 'arbitrum-sepolia',
    eip155ChainId: 421614,
    chainName: 'Arbitrum Sepolia',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://sepolia.arbiscan.io'],
  },
  'polygon-amoy': {
    chainId: 'polygon-amoy',
    eip155ChainId: 80002,
    chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://rpc-amoy.polygon.technology'],
    blockExplorerUrls: ['https://amoy.polygonscan.com'],
  },
  'optimism-sepolia': {
    chainId: 'optimism-sepolia',
    eip155ChainId: 11155420,
    chainName: 'Optimism Sepolia',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.optimism.io'],
    blockExplorerUrls: ['https://sepolia-optimism.etherscan.io'],
  },
}

export function isEvmWalletChain(chain: ChainId): chain is EvmWalletChainId {
  return (EVM_WALLET_CHAINS as readonly string[]).includes(chain)
}

export function isTronWalletChain(chain: ChainId): boolean {
  return (TRON_WALLET_CHAINS as readonly string[]).includes(chain)
}

export function isSolanaWalletChain(chain: ChainId): boolean {
  return (SOLANA_WALLET_CHAINS as readonly string[]).includes(chain)
}

export function toWalletAddChainParams(config: EvmWalletChainConfig) {
  return {
    chainId: toHexChainId(config.eip155ChainId),
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: config.rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
  }
}

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`
}
