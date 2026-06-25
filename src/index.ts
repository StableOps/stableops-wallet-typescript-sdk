// barrel re-export — 所有公共符号从这里导出，保持对外 API 不变。

export type {
  ChainId,
  Asset,
  EvmWalletChainId,
  Eip1193Provider,
  TronWalletProvider,
  SolanaWalletProvider,
  WalletProvider,
  WalletPaymentInstruction,
  WalletPaymentOrder,
  EvmWalletChainConfig,
  SendWalletPaymentInput,
  WalletProviderByChain,
  SendOrderWalletPaymentInput,
  SentWalletPayment,
} from './types'

export { StableOpsWalletError, setWalletSdkDebug, isWalletSdkDebugEnabled } from './errors'

export { EvmWalletChainConfigs } from './chains'

export {
  getInjectedEthereumProvider,
  getInjectedTronProvider,
  getInjectedSolanaProvider,
  getInjectedWalletProviders,
} from './providers'

export {
  selectWalletPaymentInstruction,
  sendOrderWalletPayment,
  sendWalletPayment,
} from './payment'

export { encodeErc20Transfer, parseTokenAmount } from './helpers'
