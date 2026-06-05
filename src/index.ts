import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

export type ChainId =
  | 'ethereum'
  | 'base'
  | 'base-sepolia'
  | 'arbitrum'
  | 'polygon'
  | 'tron'
  | 'solana'
  | 'ethereum-sepolia'
  | 'arbitrum-sepolia'
  | 'polygon-amoy'
  | 'solana-devnet'
  | 'tron-nile'

export type Asset = 'USDC' | 'USDT'

type EvmWalletChainId = Exclude<ChainId, 'tron' | 'solana' | 'tron-nile' | 'solana-devnet'>

type WalletTokenContract = {
  chain: ChainId
  asset: Asset
  address: string
  decimals: number
}

const WALLET_TOKEN_CONTRACTS: readonly WalletTokenContract[] = [
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
    address: '0xaf88d065e77cc2239327c5edb3a432268e5831',
    decimals: 6,
  },
  {
    chain: 'polygon',
    asset: 'USDC',
    address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    decimals: 6,
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
]

const EVM_WALLET_CHAINS = [
  'ethereum',
  'base',
  'base-sepolia',
  'arbitrum',
  'polygon',
  'ethereum-sepolia',
  'arbitrum-sepolia',
  'polygon-amoy',
] as const
const TRON_WALLET_CHAINS = ['tron', 'tron-nile'] as const
const SOLANA_WALLET_CHAINS = ['solana', 'solana-devnet'] as const
const ERC20_TRANSFER_SELECTOR = 'a9059cbb'
const SOLANA_MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com'
const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const SOLANA_TRANSFER_CHECKED_INSTRUCTION = 12
const SOLANA_CREATE_ASSOCIATED_TOKEN_ACCOUNT_IDEMPOTENT_INSTRUCTION = 1

export type Eip1193Provider = {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>
}

export type TronWalletProvider =
  | TronWebLike
  | {
      tronWeb?: TronWebLike
      tronLink?: { request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T> }
      request?<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
    }

export type SolanaWalletProvider = {
  publicKey?: SolanaPublicKeyLike | string | null
  connect?(): Promise<{ publicKey?: SolanaPublicKeyLike | string | null } | void>
  signAndSendTransaction?(transaction: Transaction): Promise<string | { signature?: string }>
  signTransaction?(transaction: Transaction): Promise<Transaction>
}

export type WalletProvider = Eip1193Provider | TronWalletProvider | SolanaWalletProvider

type TronWebLike = {
  defaultAddress?: { base58?: string }
  transactionBuilder: {
    triggerSmartContract(
      contractAddress: string,
      functionSelector: string,
      options: Record<string, unknown>,
      parameters: Array<{ type: string; value: string | bigint }>,
      issuerAddress?: string,
    ): Promise<{ transaction?: unknown; result?: { result?: boolean; message?: string } }>
  }
  trx: {
    sign(transaction: unknown): Promise<unknown>
    sendRawTransaction(transaction: unknown): Promise<{ txid?: string; transaction?: { txID?: string }; result?: boolean }>
  }
}

type SolanaPublicKeyLike = { toBase58(): string }

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
  solanaRpcUrl?: string
  solanaConnection?: Pick<Connection, 'getLatestBlockhash' | 'sendRawTransaction'>
}

export type WalletProviderByChain = Partial<Record<ChainId, WalletProvider | undefined>>

export type SendOrderWalletPaymentInput = Omit<SendWalletPaymentInput, 'provider' | 'instruction' | 'amount'> & {
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
}

export class StableOpsWalletError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'StableOpsWalletError'
  }
}

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
}

export function getInjectedEthereumProvider(): Eip1193Provider | undefined {
  const maybeGlobal = globalThis as typeof globalThis & { ethereum?: Eip1193Provider }
  return maybeGlobal.ethereum
}

export function getInjectedTronProvider(): TronWalletProvider | undefined {
  const maybeGlobal = globalThis as typeof globalThis & {
    tronLink?: { request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T> }
    tronWeb?: TronWebLike
  }
  if (!maybeGlobal.tronWeb) return undefined
  return { tronLink: maybeGlobal.tronLink, tronWeb: maybeGlobal.tronWeb }
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

export function selectWalletPaymentInstruction(
  instructions: readonly WalletPaymentInstruction[],
  providers: WalletProviderByChain,
  preferredChains: readonly ChainId[] = [],
): { instruction: WalletPaymentInstruction; provider: WalletProvider } {
  if (instructions.length === 0) {
    throw new StableOpsWalletError('订单还没有可支付的链上收款指令', 'payment_instruction_not_found')
  }
  const preferred = preferredChains
    .map((chain) => instructions.find((instruction) => instruction.chain === chain))
    .filter((instruction): instruction is WalletPaymentInstruction => Boolean(instruction))
  const candidates = [...preferred, ...instructions.filter((instruction) => !preferred.includes(instruction))]
  for (const instruction of candidates) {
    const provider = providers[instruction.chain]
    if (provider) return { instruction, provider }
  }
  throw new StableOpsWalletError('未找到订单候选链对应的钱包 provider', 'wallet_provider_not_found', {
    chains: instructions.map((instruction) => instruction.chain),
  })
}

export async function sendOrderWalletPayment(input: SendOrderWalletPaymentInput): Promise<SentWalletPayment> {
  const selected = selectWalletPaymentInstruction(
    input.order.paymentInstructions,
    input.providers,
    input.preferredChains,
  )
  return sendWalletPayment({
    ...input,
    provider: selected.provider,
    instruction: selected.instruction,
    amount: input.order.amount,
  })
}

export async function sendWalletPayment(input: SendWalletPaymentInput): Promise<SentWalletPayment> {
  const instruction = requireInstruction(input.instruction)
  const token = findWalletTokenContract(instruction.chain, instruction.asset)
  if (!token) {
    throw new StableOpsWalletError('未找到该链与资产的默认代币合约', 'token_contract_not_found', {
      chain: instruction.chain,
      asset: instruction.asset,
    })
  }

  if (isEvmWalletChain(instruction.chain)) {
    return sendEvmWalletPayment(input, { ...instruction, chain: instruction.chain }, token)
  }
  if (isTronWalletChain(instruction.chain)) {
    return sendTronWalletPayment(input, instruction, token)
  }
  if (isSolanaWalletChain(instruction.chain)) {
    return sendSolanaWalletPayment(input, instruction, token)
  }
  throw new StableOpsWalletError('当前钱包 SDK 不支持该链', 'unsupported_chain', { chain: instruction.chain })
}

export function encodeErc20Transfer(toAddress: string, amountUnits: bigint): string {
  const normalizedTo = normalizeEvmAddress(toAddress)
  if (amountUnits < 0n) {
    throw new StableOpsWalletError('转账金额不能为负数', 'invalid_amount', { amountUnits: amountUnits.toString() })
  }
  return `0x${ERC20_TRANSFER_SELECTOR}${padHex(normalizedTo.slice(2))}${padHex(amountUnits.toString(16))}`
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new StableOpsWalletError('代币精度配置无效', 'invalid_decimals', { decimals })
  }

  const trimmed = amount.trim()
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(trimmed)
  if (!match) {
    throw new StableOpsWalletError('转账金额格式无效', 'invalid_amount', { amount })
  }

  const whole = match[1]
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) {
    throw new StableOpsWalletError('转账金额小数位超过代币精度', 'amount_precision_exceeded', {
      amount,
      decimals,
    })
  }

  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (units <= 0n) {
    throw new StableOpsWalletError('转账金额必须大于 0', 'invalid_amount', { amount })
  }
  return units
}

async function sendEvmWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction & { chain: EvmWalletChainId },
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const provider = input.provider as Eip1193Provider
  if (!isEip1193Provider(provider)) {
    throw new StableOpsWalletError('EVM 支付需要 EIP-1193 钱包 provider', 'wallet_provider_mismatch')
  }

  const config = resolveChainConfig(instruction.chain, input.chainConfigs)
  const fromAddress = normalizeEvmAddress(input.fromAddress ?? (await requestFirstEvmAccount(provider)))
  await ensureEvmChain(provider, config)

  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  const txHash = await provider.request<string>({
    method: 'eth_sendTransaction',
    params: [
      {
        from: fromAddress,
        to: token.address,
        value: '0x0',
        data: encodeErc20Transfer(instruction.address, amountUnits),
      },
    ],
  })

  return buildSentPayment(txHash, instruction, token, fromAddress, input.amount, amountUnits)
}

async function sendTronWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const tronWeb = getTronWeb(input.provider)
  const accountRequester = getTronAccountRequester(input.provider)
  if (accountRequester) {
    await accountRequester({ method: 'tron_requestAccounts' })
  }

  const fromAddress = normalizeTronAddress(input.fromAddress ?? tronWeb.defaultAddress?.base58)
  const toAddress = normalizeTronAddress(instruction.address)
  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  const built = await tronWeb.transactionBuilder.triggerSmartContract(
    token.address,
    'transfer(address,uint256)',
    { feeLimit: 100_000_000 },
    [
      { type: 'address', value: toAddress },
      { type: 'uint256', value: amountUnits.toString() },
    ],
    fromAddress,
  )

  if (!built.transaction) {
    throw new StableOpsWalletError('TRON 钱包未能创建 TRC-20 转账交易', 'tron_transaction_build_failed', built)
  }

  const signed = await tronWeb.trx.sign(built.transaction)
  const sent = await tronWeb.trx.sendRawTransaction(signed)
  const txHash = sent.txid ?? sent.transaction?.txID ?? getTronSignedTransactionId(signed)
  if (!txHash) {
    throw new StableOpsWalletError('TRON 钱包未返回交易哈希', 'wallet_transaction_hash_not_found', sent)
  }

  return buildSentPayment(txHash, instruction, token, fromAddress, input.amount, amountUnits)
}

async function sendSolanaWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const provider = input.provider as SolanaWalletProvider
  const payer = publicKeyFromString(input.fromAddress ?? (await requestSolanaPublicKey(provider)))
  const recipient = publicKeyFromString(instruction.address)
  const mint = publicKeyFromString(token.address)
  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  const connection = input.solanaConnection ?? new Connection(input.solanaRpcUrl ?? SOLANA_MAINNET_RPC_URL, 'confirmed')
  const sourceTokenAccount = findAssociatedTokenAddress(payer, mint)
  const destinationTokenAccount = findAssociatedTokenAddress(recipient, mint)
  const latest = await connection.getLatestBlockhash()
  const transaction = new Transaction({
    feePayer: payer,
    recentBlockhash: latest.blockhash,
  })

  transaction.add(createAssociatedTokenAccountIdempotentInstruction(payer, destinationTokenAccount, recipient, mint))
  transaction.add(
    createSplTokenTransferCheckedInstruction(
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      payer,
      amountUnits,
      token.decimals,
    ),
  )

  const txHash = await sendSolanaTransaction(provider, connection, transaction)
  return buildSentPayment(txHash, instruction, token, payer.toBase58(), input.amount, amountUnits)
}

function buildSentPayment(
  txHash: string,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
  fromAddress: string,
  amount: string,
  amountUnits: bigint,
): SentWalletPayment {
  return {
    txHash,
    chain: instruction.chain,
    asset: instruction.asset,
    fromAddress,
    toAddress: instruction.address,
    tokenContract: token.address,
    amount,
    amountUnits: amountUnits.toString(),
  }
}

function isEvmWalletChain(chain: ChainId): chain is EvmWalletChainId {
  return (EVM_WALLET_CHAINS as readonly string[]).includes(chain)
}

function isTronWalletChain(chain: ChainId): boolean {
  return (TRON_WALLET_CHAINS as readonly string[]).includes(chain)
}

function isSolanaWalletChain(chain: ChainId): boolean {
  return (SOLANA_WALLET_CHAINS as readonly string[]).includes(chain)
}

function findWalletTokenContract(chain: ChainId, asset: Asset): WalletTokenContract | undefined {
  return WALLET_TOKEN_CONTRACTS.find((entry) => entry.chain === chain && entry.asset === asset)
}

function isEip1193Provider(provider: WalletProvider): provider is Eip1193Provider {
  return typeof (provider as Eip1193Provider).request === 'function'
}

async function requestFirstEvmAccount(provider: Eip1193Provider): Promise<string> {
  const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' })
  const first = accounts[0]
  if (!first) {
    throw new StableOpsWalletError('钱包未返回可用账户', 'wallet_account_not_found')
  }
  return first
}

async function ensureEvmChain(provider: Eip1193Provider, config: EvmWalletChainConfig): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(config.eip155ChainId) }],
    })
  } catch (err) {
    if (!isUnknownChainError(err)) throw err
    await provider.request({ method: 'wallet_addEthereumChain', params: [toWalletAddChainParams(config)] })
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(config.eip155ChainId) }],
    })
  }
}

function requireInstruction(instruction: WalletPaymentInstruction | null): WalletPaymentInstruction {
  if (!instruction) {
    throw new StableOpsWalletError('订单还没有可支付的链上收款指令', 'payment_instruction_not_found')
  }
  return instruction
}

function resolveChainConfig(
  chain: EvmWalletChainId,
  overrides: Partial<Record<EvmWalletChainId, EvmWalletChainConfig>> | undefined,
): EvmWalletChainConfig {
  const config = overrides?.[chain] ?? EvmWalletChainConfigs[chain]
  if (!config) {
    throw new StableOpsWalletError('未找到钱包切链配置', 'chain_config_not_found', { chain })
  }
  return config
}

function toWalletAddChainParams(config: EvmWalletChainConfig) {
  return {
    chainId: toHexChainId(config.eip155ChainId),
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: config.rpcUrls,
    blockExplorerUrls: config.blockExplorerUrls,
  }
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`
}

function isUnknownChainError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = Number((err as { code?: unknown }).code)
  if (code === 4902) return true
  const data = (err as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return false
  const originalError = (data as { originalError?: unknown }).originalError
  if (typeof originalError !== 'object' || originalError === null) return false
  return Number((originalError as { code?: unknown }).code) === 4902
}

function getTronWeb(provider: WalletProvider): TronWebLike {
  const tronWeb = (provider as { tronWeb?: TronWebLike }).tronWeb ?? (provider as TronWebLike)
  if (
    !tronWeb ||
    typeof tronWeb.transactionBuilder?.triggerSmartContract !== 'function' ||
    typeof tronWeb.trx?.sign !== 'function' ||
    typeof tronWeb.trx?.sendRawTransaction !== 'function'
  ) {
    throw new StableOpsWalletError('TRON 支付需要 TronLink / TronWeb 钱包 provider', 'wallet_provider_mismatch')
  }
  return tronWeb
}

function getTronAccountRequester(
  provider: WalletProvider,
): ((args: { method: string; params?: unknown }) => Promise<unknown>) | undefined {
  const wrapper = provider as {
    tronLink?: { request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T> }
    request?<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
  }
  return wrapper.tronLink?.request?.bind(wrapper.tronLink) ?? wrapper.request?.bind(wrapper)
}

function getTronSignedTransactionId(signed: unknown): string | undefined {
  if (typeof signed !== 'object' || signed === null) return undefined
  return (signed as { txID?: string }).txID
}

async function requestSolanaPublicKey(provider: SolanaWalletProvider): Promise<string> {
  const existing = solanaPublicKeyToString(provider.publicKey)
  if (existing) return existing
  const connected = await provider.connect?.()
  const connectedKey = connected ? solanaPublicKeyToString(connected.publicKey) : undefined
  const providerKey = solanaPublicKeyToString(provider.publicKey)
  const publicKey = connectedKey ?? providerKey
  if (!publicKey) {
    throw new StableOpsWalletError('Solana 钱包未返回可用账户', 'wallet_account_not_found')
  }
  return publicKey
}

async function sendSolanaTransaction(
  provider: SolanaWalletProvider,
  connection: Pick<Connection, 'sendRawTransaction'>,
  transaction: Transaction,
): Promise<string> {
  if (typeof provider.signAndSendTransaction === 'function') {
    const result = await provider.signAndSendTransaction(transaction)
    const signature = typeof result === 'string' ? result : result.signature
    if (!signature) {
      throw new StableOpsWalletError('Solana 钱包未返回交易签名', 'wallet_transaction_hash_not_found', result)
    }
    return signature
  }

  if (typeof provider.signTransaction !== 'function') {
    throw new StableOpsWalletError('Solana 支付需要钱包支持 signAndSendTransaction 或 signTransaction', 'wallet_provider_mismatch')
  }
  const signed = await provider.signTransaction(transaction)
  return connection.sendRawTransaction(signed.serialize())
}

function solanaPublicKeyToString(publicKey: SolanaPublicKeyLike | string | null | undefined): string | undefined {
  if (!publicKey) return undefined
  if (typeof publicKey === 'string') return publicKey
  return publicKey.toBase58()
}

function publicKeyFromString(address: string): PublicKey {
  try {
    return new PublicKey(address)
  } catch (err) {
    throw new StableOpsWalletError('Solana 地址格式无效', 'invalid_solana_address', { address, cause: err })
  }
}

function findAssociatedTokenAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SOLANA_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

function createAssociatedTokenAccountIdempotentInstruction(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SOLANA_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([SOLANA_CREATE_ASSOCIATED_TOKEN_ACCOUNT_IDEMPOTENT_INSTRUCTION]) as unknown as Buffer,
  })
}

function createSplTokenTransferCheckedInstruction(
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amountUnits: bigint,
  decimals: number,
): TransactionInstruction {
  const data = new Uint8Array(10)
  data[0] = SOLANA_TRANSFER_CHECKED_INSTRUCTION
  writeBigUInt64LE(data, amountUnits, 1)
  data[9] = decimals
  return new TransactionInstruction({
    programId: SOLANA_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: data as unknown as Buffer,
  })
}

function writeBigUInt64LE(bytes: Uint8Array, value: bigint, offset: number): void {
  if (value > 0xffffffffffffffffn) {
    throw new StableOpsWalletError('转账金额超出 u64 范围', 'invalid_amount', { amountUnits: value.toString() })
  }
  let remaining = value
  for (let index = 0; index < 8; index++) {
    bytes[offset + index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
}

function normalizeEvmAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new StableOpsWalletError('EVM 地址格式无效', 'invalid_evm_address', { address })
  }
  return address.toLowerCase()
}

function normalizeTronAddress(address: string | undefined): string {
  if (!address || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/u.test(address)) {
    throw new StableOpsWalletError('TRON 地址格式无效', 'invalid_tron_address', { address })
  }
  return address
}

function padHex(hex: string): string {
  return hex.padStart(64, '0')
}
