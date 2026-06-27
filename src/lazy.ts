import { StableOpsWalletError } from './errors'

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
