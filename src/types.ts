import type { Connection } from '@solana/web3.js'

export type ChainId =
  | 'ethereum'
  | 'base'
  | 'base-sepolia'
  | 'arbitrum'
  | 'polygon'
  | 'optimism'
  | 'bsc'
  | 'bsc-testnet'
  | 'tron'
  | 'solana'
  | 'ethereum-sepolia'
  | 'arbitrum-sepolia'
  | 'polygon-amoy'
  | 'optimism-sepolia'
  | 'solana-devnet'
  | 'tron-nile'

export type Asset = 'USDC' | 'USDT'

export type EvmWalletChainId = Exclude<ChainId, 'tron' | 'solana' | 'tron-nile' | 'solana-devnet'>

export type WalletTokenContract = {
  chain: ChainId
  asset: Asset
  address: string
  decimals: number
}

export type Eip1193Provider = {
  request<T = unknown>(args: {
    method: string
    params?: unknown[] | Record<string, unknown>
  }): Promise<T>
}

export type TronWalletProvider =
  | TronWebLike
  | {
      tronWeb?: TronWebLike
      tronLink?: {
        tronWeb?: TronWebLike
        request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T>
      }
      request?<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
    }

// WalletConnect 上的 CAIP-2 TRON chainId(主网 / Nile 测试网)。
export type WalletConnectTronChainId = 'tron:0x2b6653dc' | 'tron:0xcd8690dc'

// 通过 WalletConnect(universal-provider)连接的 TRON 账户。
// 钱包只负责签名(tron_signTransaction),交易构造与广播由 SDK 用 tronweb 完成。
export type WalletConnectTronProvider = {
  walletConnectTron: true
  chainId: WalletConnectTronChainId
  account: string
  signTransaction(transaction: unknown): Promise<unknown>
}

export type SolanaWalletProvider = {
  publicKey?: SolanaPublicKeyLike | string | null
  connect?(): Promise<{
    publicKey?: SolanaPublicKeyLike | string | null
  } | void>
  signAndSendTransaction?(transaction: import('@solana/web3.js').Transaction): Promise<string | { signature?: string }>
  signTransaction?(transaction: import('@solana/web3.js').Transaction): Promise<import('@solana/web3.js').Transaction>
}

export type WalletProvider =
  | Eip1193Provider
  | TronWalletProvider
  | WalletConnectTronProvider
  | SolanaWalletProvider

export type TronWebLike = {
  defaultAddress?: { base58?: string | false; hex?: string | false }
  address?: {
    fromHex?(address: string): string
  }
  transactionBuilder: {
    triggerSmartContract(
      contractAddress: string,
      functionSelector: string,
      options: Record<string, unknown>,
      parameters: Array<{ type: string; value: string | bigint }>,
      issuerAddress?: string,
    ): Promise<{
      transaction?: unknown
      result?: { result?: boolean; message?: string }
    }>
  }
  trx: {
    sign(transaction: unknown): Promise<unknown>
    sendRawTransaction(transaction: unknown): Promise<{
      txid?: string
      transaction?: { txID?: string }
      result?: boolean
    }>
    getTransactionInfo?(txID: string): Promise<{
      id?: string
      receipt?: { result?: string }
    }>
  }
}

export type SolanaPublicKeyLike = { toBase58(): string }

export type WalletPaymentInstruction = {
  chain: ChainId
  asset: Asset
  address: string
}

export type WalletPaymentOrder = {
  amount: string
  paymentInstructions: WalletPaymentInstruction[]
}

export type EvmWalletChainConfig = {
  chainId: EvmWalletChainId
  eip155ChainId: number
  chainName: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  rpcUrls: string[]
  blockExplorerUrls?: string[]
}

export type SendWalletPaymentInput = {
  provider: WalletProvider
  instruction: WalletPaymentInstruction | null
  amount: string
  fromAddress?: string
  chainConfigs?: Partial<Record<EvmWalletChainId, EvmWalletChainConfig>>
  // 仅 WalletConnect TRON 支付需要:用于 tronweb 构造未签名交易并广播签名结果的全节点。
  // 缺省按链选用 trongrid 公共节点(主网 / Nile)。
  tronRpcUrl?: string
  solanaRpcUrl?: string
  solanaConnection?: Pick<Connection, 'getLatestBlockhash' | 'sendRawTransaction'>
}

export type WalletProviderByChain = Partial<Record<ChainId, WalletProvider | undefined>>

export type SendOrderWalletPaymentInput = Omit<
  SendWalletPaymentInput,
  'provider' | 'instruction' | 'amount'
> & {
  order: WalletPaymentOrder
  providers: WalletProviderByChain
  preferredChains?: ChainId[]
}

export type SentWalletPayment = {
  txHash: string
  chain: ChainId
  asset: Asset
  fromAddress: string
  toAddress: string
  tokenContract: string
  amount: string
  amountUnits: string
  /** 链上交易回执确认结果。仅供参考，以服务端 scanner 为准：
   * resolve 表示交易已上链且合约执行成功（或超时 best-effort 放行），
   * reject（wallet_tx_reverted）表示链上 revert，没有代币转出。
   * 查询在后台进行，不阻塞支付流程返回；设计目的是在交易发出后尽早捕获
   * 立即 revert（如余额不足），避免用户长时间等待后才发现失败。
   * 若服务端 scanner 已推进订单状态（detected/confirmed），则以服务端为准。 */
  confirmation: Promise<void>
}
