import { EvmWalletChainConfigs, toWalletAddChainParams, toHexChainId } from './chains'
import { StableOpsWalletError, walletDebug } from './errors'
import { encodeErc20Transfer, parseTokenAmount, buildSentPayment, delay, normalizeEvmAddress } from './helpers'
import type {
  Eip1193Provider,
  EvmWalletChainConfig,
  EvmWalletChainId,
  SendWalletPaymentInput,
  SentWalletPayment,
  WalletPaymentInstruction,
  WalletProvider,
  WalletTokenContract,
} from './types'

export function isEip1193Provider(provider: WalletProvider): provider is Eip1193Provider {
  return typeof (provider as Eip1193Provider).request === 'function'
}

export async function requestFirstEvmAccount(provider: Eip1193Provider): Promise<string> {
  const accounts = await provider.request<string[]>({
    method: 'eth_requestAccounts',
  })
  const first = accounts[0]
  if (!first) {
    throw new StableOpsWalletError(
      'Wallet did not return an available account',
      'wallet_account_not_found',
    )
  }
  return first
}

export async function ensureEvmChain(
  provider: Eip1193Provider,
  config: EvmWalletChainConfig,
): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(config.eip155ChainId) }],
    })
  } catch (err) {
    if (!isUnknownChainError(err)) throw err
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [toWalletAddChainParams(config)],
    })
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: toHexChainId(config.eip155ChainId) }],
    })
  }
}

export function resolveChainConfig(
  chain: EvmWalletChainId,
  overrides: Partial<Record<EvmWalletChainId, EvmWalletChainConfig>> | undefined,
): EvmWalletChainConfig {
  const config = overrides?.[chain] ?? EvmWalletChainConfigs[chain]
  if (!config) {
    throw new StableOpsWalletError(
      'No chain-switching configuration found for this wallet',
      'chain_config_not_found',
      { chain },
    )
  }
  return config
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

// EVM 回执轮询参数：默认每 ~2s 查一次，最长 ~90s。revert 与成功一样会很快上链，
// 这个窗口足以在超时前捕获绝大多数 revert；慢链/节点滞后导致拿不到回执时按 best-effort 放行。
const EVM_RECEIPT_POLL_INTERVAL_MS = 2_000
const EVM_RECEIPT_TIMEOUT_MS = 90_000

type EvmTransactionReceipt = { status?: string | null } | null

// 轮询 eth_getTransactionReceipt 并按 EIP-658 校验 status：
//   0x0 → 链上 revert，抛 wallet_tx_reverted（没有代币转出，订单不会 detected）。
//   0x1 → 成功，正常返回。
//   缺 status 字段 / 超时仍无回执 → best-effort 放行，把最终判断交给 scanner（按实际入金匹配）。
async function confirmEvmTransactionSuccess(
  provider: Eip1193Provider,
  txHash: string,
): Promise<void> {
  const deadline = Date.now() + EVM_RECEIPT_TIMEOUT_MS
  for (;;) {
    let receipt: EvmTransactionReceipt = null
    try {
      receipt = await provider.request<EvmTransactionReceipt>({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      })
    } catch (err) {
      // 单次回执查询出错（节点抖动）不致命：记一行 debug，继续轮询直到超时。
      walletDebug('evm:receipt-error', { txHash, error: String(err) })
    }
    if (receipt) {
      const raw = typeof receipt.status === 'string' ? receipt.status.toLowerCase() : receipt.status
      walletDebug('evm:receipt', { txHash, status: receipt.status })
      if (raw === '0x0' || raw === '0x00') {
        throw new StableOpsWalletError(
          'On-chain transfer reverted (receipt status 0x0); no tokens were moved. A common cause is insufficient token balance in the paying wallet.',
          'wallet_tx_reverted',
          { txHash, status: receipt.status },
        )
      }
      // 0x1 / 0x01 成功，或回执缺 status 字段：均结束等待。
      return
    }
    if (Date.now() >= deadline) {
      walletDebug('evm:receipt-timeout', { txHash })
      return
    }
    await delay(EVM_RECEIPT_POLL_INTERVAL_MS)
  }
}

export async function sendEvmWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction & { chain: EvmWalletChainId },
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const provider = input.provider as Eip1193Provider
  if (!isEip1193Provider(provider)) {
    throw new StableOpsWalletError(
      'EVM payments require an EIP-1193 wallet provider',
      'wallet_provider_mismatch',
    )
  }

  const config = resolveChainConfig(instruction.chain, input.chainConfigs)
  const fromAddress = normalizeEvmAddress(
    input.fromAddress ?? (await requestFirstEvmAccount(provider)),
  )
  walletDebug('evm:from', { chain: instruction.chain, fromAddress })
  await ensureEvmChain(provider, config)
  walletDebug('evm:chain-ready', { eip155ChainId: config.eip155ChainId })

  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  walletDebug('evm:eth_sendTransaction:request', {
    from: fromAddress,
    to: token.address,
    amountUnits: amountUnits.toString(),
  })
  let txHash: string
  try {
    txHash = await provider.request<string>({
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
    walletDebug('evm:eth_sendTransaction:ok', { txHash })
  } catch (err) {
    walletDebug('evm:eth_sendTransaction:error', { error: String(err) })
    throw err
  }

  const confirmation = confirmEvmTransactionSuccess(provider, txHash)
  confirmation.catch(() => {})

  return {
    ...buildSentPayment(txHash, instruction, token, fromAddress, input.amount, amountUnits),
    confirmation,
  }
}
