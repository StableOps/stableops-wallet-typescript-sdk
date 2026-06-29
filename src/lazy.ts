import { StableOpsWalletError } from './errors'
import type { TronWebLike } from './types'

// @solana/web3.js 是可选 peer 依赖：仅 Solana 支付路径需要，懒加载以免
// 只用 EVM/TRON 的使用者被迫安装，且缺失时抛出友好异常而非模块加载崩溃。
export type SolanaWeb3 = typeof import('@solana/web3.js')

let solanaWeb3Promise: Promise<SolanaWeb3> | undefined

export async function loadSolanaWeb3(): Promise<SolanaWeb3> {
  if (!solanaWeb3Promise) {
    solanaWeb3Promise = import('@solana/web3.js').catch((err) => {
      solanaWeb3Promise = undefined
      throw new StableOpsWalletError(
        'Solana payments require the optional dependency @solana/web3.js; please install it: npm install @solana/web3.js',
        'solana_dependency_missing',
        { cause: err },
      )
    })
  }
  return solanaWeb3Promise
}

// tronweb 是可选 peer 依赖：仅 WalletConnect TRON 支付路径需要(用于构造未签名交易并广播
// 签名结果);注入式 TronLink 路径自带 tronWeb，不依赖它。懒加载，缺失时抛友好异常。
type TronWebModule = {
  TronWeb: new (options: { fullHost: string }) => unknown
}

let tronWebPromise: Promise<TronWebModule> | undefined

async function loadTronWebModule(): Promise<TronWebModule> {
  if (!tronWebPromise) {
    tronWebPromise = import('tronweb')
      .then((mod) => mod as unknown as TronWebModule)
      .catch((err) => {
        tronWebPromise = undefined
        throw new StableOpsWalletError(
          'TRON WalletConnect payments require the optional dependency tronweb; please install it: npm install tronweb',
          'tron_dependency_missing',
          { cause: err },
        )
      })
  }
  return tronWebPromise
}

// 按 fullHost 构造一个 tronweb 实例(只读节点访问，无私钥);返回 SDK 内部使用的最小接口形状。
export async function loadTronWeb(fullHost: string): Promise<TronWebLike> {
  const { TronWeb } = await loadTronWebModule()
  return new TronWeb({ fullHost }) as unknown as TronWebLike
}
