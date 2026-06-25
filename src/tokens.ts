import type { Asset, ChainId, WalletTokenContract } from './types'

export const WALLET_TOKEN_CONTRACTS: readonly WalletTokenContract[] = [
  {
    chain: 'ethereum',
    asset: 'USDC',
    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    decimals: 6,
  },
  {
    chain: 'ethereum',
    asset: 'USDT',
    address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    decimals: 6,
  },
  {
    chain: 'base',
    asset: 'USDC',
    address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    decimals: 6,
  },
  {
    chain: 'base-sepolia',
    asset: 'USDC',
    address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    decimals: 6,
  },
  {
    chain: 'arbitrum',
    asset: 'USDC',
    address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
    decimals: 6,
  },
  {
    chain: 'polygon',
    asset: 'USDC',
    address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    decimals: 6,
  },
  {
    chain: 'optimism',
    asset: 'USDC',
    address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    decimals: 6,
  },
  {
    chain: 'optimism',
    asset: 'USDT',
    address: '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58',
    decimals: 6,
  },
  {
    chain: 'bsc',
    asset: 'USDC',
    address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
    decimals: 18,
  },
  {
    chain: 'bsc',
    asset: 'USDT',
    address: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
  },
  {
    chain: 'tron',
    asset: 'USDT',
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
  },
  {
    chain: 'solana',
    asset: 'USDC',
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
  {
    chain: 'solana',
    asset: 'USDT',
    address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
  },
  {
    chain: 'ethereum-sepolia',
    asset: 'USDC',
    address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
    decimals: 6,
  },
  {
    chain: 'arbitrum-sepolia',
    asset: 'USDC',
    address: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
    decimals: 6,
  },
  {
    chain: 'polygon-amoy',
    asset: 'USDC',
    address: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
    decimals: 6,
  },
  {
    chain: 'optimism-sepolia',
    asset: 'USDC',
    address: '0x5fd84259d66cd46123540766be93dfe6d43130d7',
    decimals: 6,
  },
  {
    chain: 'solana-devnet',
    asset: 'USDC',
    address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    decimals: 6,
  },
  {
    chain: 'tron-nile',
    asset: 'USDT',
    address: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
    decimals: 6,
  },
  {
    chain: 'bsc-testnet',
    asset: 'USDC',
    address: '0x64544969ed7ebf5f083679233325356ebe738930',
    decimals: 18,
  },
  {
    chain: 'bsc-testnet',
    asset: 'USDT',
    address: '0x66e972502a34a625828c544a1914e8d8cc2a9de5',
    decimals: 18,
  },
]

export function findWalletTokenContract(chain: ChainId, asset: Asset): WalletTokenContract | undefined {
  return WALLET_TOKEN_CONTRACTS.find((entry) => entry.chain === chain && entry.asset === asset)
}
