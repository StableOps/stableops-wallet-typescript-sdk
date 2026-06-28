import { StableOpsWalletError, walletDebug } from './errors'
import { parseTokenAmount, buildSentPayment, delay } from './helpers'
import type {
  SendWalletPaymentInput,
  SentWalletPayment,
  TronWebLike,
  WalletPaymentInstruction,
  WalletProvider,
  WalletTokenContract,
} from './types'

const TRON_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/u
// tron_requestAccounts 返回后，TronLink 不会同步写入 defaultAddress：
// base58 会短暂保持 false / 空值，立即读取会得到无效地址；这里给它一个短轮询窗口。
const TRON_ADDRESS_READY_TIMEOUT_MS = 3_000
const TRON_ADDRESS_POLL_INTERVAL_MS = 150

// TRON 执行回执轮询参数：~3s 出块，每 ~3s 查一次，最长 ~90s。
const TRON_RECEIPT_POLL_INTERVAL_MS = 3_000
const TRON_RECEIPT_TIMEOUT_MS = 90_000

// tron_requestAccounts 响应码
const TRON_REQUEST_ACCOUNTS_CODE = {
  OK: 200,
  PENDING: 4000,
  REJECTED: 4001,
} as const

function isValidTronBase58(value: unknown): value is string {
  return typeof value === 'string' && TRON_ADDRESS_REGEX.test(value)
}

function normalizeTronAddress(address: string | undefined): string {
  if (!address || !TRON_ADDRESS_REGEX.test(address)) {
    throw new StableOpsWalletError('Invalid TRON address format', 'invalid_tron_address', {
      address,
    })
  }
  return address
}

function isReadyTronWeb(value: unknown): value is TronWebLike {
  const tronWeb = value as TronWebLike | undefined
  return Boolean(
    tronWeb &&
    typeof tronWeb.transactionBuilder?.triggerSmartContract === 'function' &&
    typeof tronWeb.trx?.sign === 'function' &&
    typeof tronWeb.trx?.sendRawTransaction === 'function',
  )
}

function getTronWeb(provider: WalletProvider, preferLatest = false): TronWebLike {
  const wrapper = provider as {
    tronLink?: { tronWeb?: TronWebLike }
    tronWeb?: TronWebLike
  }
  const maybeGlobal = globalThis as typeof globalThis & {
    tronLink?: { tronWeb?: TronWebLike }
    tronWeb?: TronWebLike
  }
  const cachedCandidates = [wrapper.tronLink?.tronWeb, wrapper.tronWeb, provider as TronWebLike]
  const latestCandidates = [maybeGlobal.tronLink?.tronWeb, maybeGlobal.tronWeb]
  const tronWeb = [
    ...(preferLatest ? latestCandidates : cachedCandidates),
    ...(preferLatest ? cachedCandidates : latestCandidates),
  ].find(isReadyTronWeb)
  if (!tronWeb) {
    throw new StableOpsWalletError(
      'TRON payments require a TronLink / TronWeb wallet provider',
      'wallet_provider_mismatch',
    )
  }
  return tronWeb
}

function canAwaitTronWeb(provider: WalletProvider): boolean {
  const wrapper = provider as {
    tronLink?: { request?: unknown; tronWeb?: TronWebLike }
    request?: unknown
    tronWeb?: TronWebLike
  }
  const maybeGlobal = globalThis as typeof globalThis & {
    tronLink?: { request?: unknown; tronWeb?: TronWebLike }
    tronWeb?: TronWebLike
  }
  return Boolean(
    wrapper.tronLink?.request ||
    wrapper.request ||
    wrapper.tronLink?.tronWeb ||
    wrapper.tronWeb ||
    maybeGlobal.tronLink?.request ||
    maybeGlobal.tronLink?.tronWeb ||
    maybeGlobal.tronWeb,
  )
}

async function resolveTronWeb(provider: WalletProvider): Promise<TronWebLike> {
  if (!canAwaitTronWeb(provider)) return getTronWeb(provider)
  const deadline = Date.now() + TRON_ADDRESS_READY_TIMEOUT_MS
  while (true) {
    try {
      return getTronWeb(provider)
    } catch (err) {
      if (
        !(err instanceof StableOpsWalletError) ||
        err.code !== 'wallet_provider_mismatch' ||
        Date.now() >= deadline
      ) {
        throw err
      }
    }
    await delay(TRON_ADDRESS_POLL_INTERVAL_MS)
  }
}

function getTronAccountRequester(
  provider: WalletProvider,
): ((args: { method: string; params?: unknown }) => Promise<unknown>) | undefined {
  const wrapper = provider as {
    tronLink?: {
      request: <T = unknown>(args: { method: string; params?: unknown }) => Promise<T>
    }
    request?<T = unknown>(args: { method: string; params?: unknown }): Promise<T>
  }
  return wrapper.tronLink?.request?.bind(wrapper.tronLink) ?? wrapper.request?.bind(wrapper)
}

function getTronSignedTransactionId(signed: unknown): string | undefined {
  if (typeof signed !== 'object' || signed === null) return undefined
  return (signed as { txID?: string }).txID
}

function resolveTronDefaultAddressBase58(tronWeb: TronWebLike): string | undefined {
  const base58 = tronWeb.defaultAddress?.base58
  if (isValidTronBase58(base58)) return base58

  const hex = tronWeb.defaultAddress?.hex
  if (typeof hex !== 'string' || !hex) return undefined
  const fromHex = tronWeb.address?.fromHex
  if (typeof fromHex !== 'function') return undefined

  try {
    const converted = fromHex(hex)
    return isValidTronBase58(converted) ? converted : undefined
  } catch {
    return undefined
  }
}

// 调用 tron_requestAccounts 触发 TronLink 解锁/授权弹窗，并检查返回码：
//   200       → 已授权，继续。
//   4001      → 用户主动拒绝，立即抛出 wallet_user_rejected。
//   4000      → 请求排队中（钱包弹窗等待响应），由后续 resolveTronWeb 轮询兜底。
//   老版本无结构化返回 → catch 忽略，行为与之前一致。
async function requestTronAccounts(
  accountRequester: (args: { method: string; params?: unknown }) => Promise<unknown>,
): Promise<void> {
  walletDebug('tron:requestAccounts')

  let result: { code?: number; message?: string } | undefined
  try {
    result = (await accountRequester({ method: 'tron_requestAccounts' })) as typeof result
  } catch (err) {
    // 部分老版本 TronLink 调用本身会抛出，忽略后由后续流程兜底处理。
    walletDebug('tron:requestAccounts-error', { error: String(err) })
    return
  }

  walletDebug('tron:requestAccounts-result', result)

  const code = result?.code
  if (code === TRON_REQUEST_ACCOUNTS_CODE.REJECTED) {
    throw new StableOpsWalletError(
      'User rejected the TronLink authorization request',
      'wallet_user_rejected',
      result,
    )
  }
  // code === 200（已授权）或 undefined（老版本）→ 继续；
  // code === 4000（等待用户操作）→ 由 resolveTronWeb / resolveTronFromAddress 轮询兜底。
}

// 解析 TRON 付款方地址：调用方显式传入时直接校验返回；
// 否则等待 TronLink 填好 defaultAddress，避免授权后短暂空窗期误报地址无效。
async function resolveTronFromAddress(
  provider: WalletProvider,
  tronWeb: TronWebLike,
  explicit: string | undefined,
): Promise<{ tronWeb: TronWebLike; fromAddress: string }> {
  if (explicit) return { tronWeb, fromAddress: normalizeTronAddress(explicit) }
  const deadline = Date.now() + TRON_ADDRESS_READY_TIMEOUT_MS
  let current = tronWeb
  let base58 = resolveTronDefaultAddressBase58(current)
  if (!base58) {
    walletDebug('tron:awaiting-address', {
      initialBase58: current.defaultAddress?.base58,
      hasHex: typeof current.defaultAddress?.hex === 'string',
    })
  }
  while (!base58 && Date.now() < deadline) {
    await delay(TRON_ADDRESS_POLL_INTERVAL_MS)
    // TronLink 可能在授权后替换全局 tronWeb 对象；轮询时优先重读最新引用。
    try {
      current = getTronWeb(provider, true)
    } catch {
      // 尚未就绪，继续等待。
    }
    base58 = resolveTronDefaultAddressBase58(current)
  }
  if (!base58) {
    throw new StableOpsWalletError(
      'TRON wallet address is not ready; please ensure TronLink is authorized and unlocked',
      'tron_address_not_ready',
    )
  }
  return { tronWeb: current, fromAddress: base58 }
}

// 轮询 getTransactionInfo 校验 TRC-20 执行回执：
//   receipt.result 非 'SUCCESS'（REVERT / OUT_OF_ENERGY 等）→ 抛 wallet_tx_reverted。
//   'SUCCESS' → 正常返回。
//   老版本 tronWeb 无 getTransactionInfo / 超时仍无回执 → best-effort 放行，交给 scanner。
async function confirmTronTransactionSuccess(tronWeb: TronWebLike, txID: string): Promise<void> {
  const getInfo = tronWeb.trx.getTransactionInfo
  if (typeof getInfo !== 'function') return
  const deadline = Date.now() + TRON_RECEIPT_TIMEOUT_MS
  for (;;) {
    let result: string | undefined
    try {
      const info = await getInfo.call(tronWeb.trx, txID)
      result = info?.receipt?.result
    } catch (err) {
      walletDebug('tron:receipt-error', { txID, error: String(err) })
    }
    if (result) {
      walletDebug('tron:receipt', { txID, result })
      if (result !== 'SUCCESS') {
        throw new StableOpsWalletError(
          `On-chain TRC-20 transfer failed (receipt result ${result}); no tokens were moved. A common cause is insufficient token balance or energy.`,
          'wallet_tx_reverted',
          { txHash: txID, result },
        )
      }
      return
    }
    if (Date.now() >= deadline) {
      walletDebug('tron:receipt-timeout', { txID })
      return
    }
    await delay(TRON_RECEIPT_POLL_INTERVAL_MS)
  }
}

export async function sendTronWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const accountRequester = getTronAccountRequester(input.provider)
  if (accountRequester) {
    // 触发 TronLink 解锁/授权弹窗，并处理用户拒绝的情况。
    await requestTronAccounts(accountRequester)
  }

  const initialTronWeb = await resolveTronWeb(input.provider)
  const { tronWeb, fromAddress } = await resolveTronFromAddress(
    input.provider,
    initialTronWeb,
    input.fromAddress,
  )
  walletDebug('tron:from', { fromAddress })
  const toAddress = normalizeTronAddress(instruction.address)
  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  walletDebug('tron:build', {
    contract: token.address,
    amountUnits: amountUnits.toString(),
  })
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
    throw new StableOpsWalletError(
      'TRON wallet failed to create TRC-20 transfer transaction',
      'tron_transaction_build_failed',
      built,
    )
  }

  walletDebug('tron:sign')
  const signed = await tronWeb.trx.sign(built.transaction)
  walletDebug('tron:broadcast')
  const sent = await tronWeb.trx.sendRawTransaction(signed)
  const txHash = sent.txid ?? sent.transaction?.txID ?? getTronSignedTransactionId(signed)
  if (!txHash) {
    throw new StableOpsWalletError(
      'TRON wallet did not return a transaction hash',
      'wallet_transaction_hash_not_found',
      sent,
    )
  }

  // 广播后不阻塞：回执查询在后台进行（TRON getTransactionInfo 可能很慢），
  // 通过 confirmation promise 将链上 revert 结果通知调用方。
  const confirmation = confirmTronTransactionSuccess(tronWeb, txHash)
  confirmation.catch(() => {})

  return {
    ...buildSentPayment(txHash, instruction, token, fromAddress, input.amount, amountUnits),
    confirmation,
  }
}
