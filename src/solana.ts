import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js'

import {
  SOLANA_MAINNET_RPC_URL,
  SOLANA_TOKEN_PROGRAM_ID_BASE58,
  SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID_BASE58,
  SOLANA_TRANSFER_CHECKED_INSTRUCTION,
  SOLANA_CREATE_ASSOCIATED_TOKEN_ACCOUNT_IDEMPOTENT_INSTRUCTION,
} from './chains'
import { StableOpsWalletError, walletDebug } from './errors'
import { loadSolanaWeb3, type SolanaWeb3 } from './lazy'
import { parseTokenAmount, buildSentPayment, delay } from './helpers'
import type {
  SendWalletPaymentInput,
  SentWalletPayment,
  SolanaPublicKeyLike,
  SolanaWalletProvider,
  WalletPaymentInstruction,
  WalletTokenContract,
} from './types'

// Solana 签名状态轮询参数：每 ~2s 查一次，最长 ~90s。
const SOLANA_STATUS_POLL_INTERVAL_MS = 2_000
const SOLANA_STATUS_TIMEOUT_MS = 90_000

type SolanaSignatureStatusConnection = {
  getSignatureStatuses?(signatures: string[]): Promise<{
    value: Array<{ err?: unknown; confirmationStatus?: string } | null>
  }>
}

function solanaPublicKeyToString(
  publicKey: SolanaPublicKeyLike | string | null | undefined,
): string | undefined {
  if (!publicKey) return undefined
  if (typeof publicKey === 'string') return publicKey
  return publicKey.toBase58()
}

function publicKeyFromString(web3: SolanaWeb3, address: string): PublicKey {
  try {
    return new web3.PublicKey(address)
  } catch (err) {
    throw new StableOpsWalletError('Invalid Solana address format', 'invalid_solana_address', {
      address,
      cause: err,
    })
  }
}

function findAssociatedTokenAddress(
  web3: SolanaWeb3,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
  associatedTokenProgramId: PublicKey,
): PublicKey {
  return web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgramId.toBuffer(), mint.toBuffer()],
    associatedTokenProgramId,
  )[0]
}

function createAssociatedTokenAccountIdempotentInstruction(
  web3: SolanaWeb3,
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgramId: PublicKey,
  associatedTokenProgramId: PublicKey,
): TransactionInstruction {
  return new web3.TransactionInstruction({
    programId: associatedTokenProgramId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      {
        pubkey: web3.SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: tokenProgramId, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([
      SOLANA_CREATE_ASSOCIATED_TOKEN_ACCOUNT_IDEMPOTENT_INSTRUCTION,
    ]) as unknown as Buffer,
  })
}

function createSplTokenTransferCheckedInstruction(
  web3: SolanaWeb3,
  source: PublicKey,
  mint: PublicKey,
  destination: PublicKey,
  owner: PublicKey,
  amountUnits: bigint,
  decimals: number,
  tokenProgramId: PublicKey,
): TransactionInstruction {
  const data = new Uint8Array(10)
  data[0] = SOLANA_TRANSFER_CHECKED_INSTRUCTION
  writeBigUInt64LE(data, amountUnits, 1)
  data[9] = decimals
  return new web3.TransactionInstruction({
    programId: tokenProgramId,
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
    throw new StableOpsWalletError('Transfer amount exceeds u64 range', 'invalid_amount', {
      amountUnits: value.toString(),
    })
  }
  let remaining = value
  for (let index = 0; index < 8; index++) {
    bytes[offset + index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
}

async function requestSolanaPublicKey(provider: SolanaWalletProvider): Promise<string> {
  const existing = solanaPublicKeyToString(provider.publicKey)
  if (existing) return existing
  const connected = await provider.connect?.()
  const connectedKey = connected ? solanaPublicKeyToString(connected.publicKey) : undefined
  const providerKey = solanaPublicKeyToString(provider.publicKey)
  const publicKey = connectedKey ?? providerKey
  if (!publicKey) {
    throw new StableOpsWalletError(
      'Solana wallet did not return an available account',
      'wallet_account_not_found',
    )
  }
  return publicKey
}

async function sendSolanaTransaction(
  provider: SolanaWalletProvider,
  connection: Pick<Connection, 'sendRawTransaction'>,
  transaction: import('@solana/web3.js').Transaction,
  preferLocalSend: boolean,
): Promise<string> {
  // signAndSendTransaction 会通过钱包当前选择的网络提交（Phantom 默认主网）。
  // 调用方显式提供 connection / RPC（如 playground devnet）时，blockhash 和 token account
  // 都属于目标 cluster；若交给钱包发到主网，通常会得到含糊的 "Unexpected error"。
  // 因此这里使用「仅签名 + 本地广播」把交易固定到目标 cluster。
  if (preferLocalSend) {
    if (typeof provider.signTransaction !== 'function') {
      throw new StableOpsWalletError(
        'Solana payments with an explicit RPC or connection require a wallet that supports signTransaction',
        'wallet_provider_mismatch',
      )
    }
    walletDebug('solana:send-via', { method: 'signTransaction+localBroadcast' })
    const signed = await provider.signTransaction(transaction)
    return connection.sendRawTransaction(signed.serialize())
  }

  if (typeof provider.signAndSendTransaction === 'function') {
    walletDebug('solana:send-via', { method: 'signAndSendTransaction' })
    const result = await provider.signAndSendTransaction(transaction)
    const signature = typeof result === 'string' ? result : result.signature
    if (!signature) {
      throw new StableOpsWalletError(
        'Solana wallet did not return a transaction signature',
        'wallet_transaction_hash_not_found',
        result,
      )
    }
    return signature
  }

  if (typeof provider.signTransaction !== 'function') {
    throw new StableOpsWalletError(
      'Solana payments require the wallet to support signAndSendTransaction or signTransaction',
      'wallet_provider_mismatch',
    )
  }
  const signed = await provider.signTransaction(transaction)
  return connection.sendRawTransaction(signed.serialize())
}

// 轮询 getSignatureStatuses 校验交易状态：
//   err 非空 → 链上执行失败，抛 wallet_tx_reverted。
//   err 为空且 confirmed/finalized → 正常返回。
//   connection 不支持 getSignatureStatuses（如测试桩）/ 超时仍无状态 → best-effort 放行，交给 scanner。
async function confirmSolanaTransactionSuccess(
  connection: unknown,
  signature: string,
): Promise<void> {
  const getStatuses = (connection as SolanaSignatureStatusConnection).getSignatureStatuses
  if (typeof getStatuses !== 'function') return
  const deadline = Date.now() + SOLANA_STATUS_TIMEOUT_MS
  for (;;) {
    let status: { err?: unknown; confirmationStatus?: string } | null | undefined
    try {
      const res = await getStatuses.call(connection, [signature])
      status = res?.value?.[0]
    } catch (err) {
      walletDebug('solana:status-error', { signature, error: String(err) })
    }
    if (status) {
      walletDebug('solana:status', {
        signature,
        err: status.err ?? null,
        confirmationStatus: status.confirmationStatus,
      })
      if (status.err) {
        throw new StableOpsWalletError(
          'On-chain Solana transfer failed (transaction returned an error); no tokens were moved. A common cause is insufficient token balance.',
          'wallet_tx_reverted',
          { txHash: signature, error: status.err },
        )
      }
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        return
      }
    }
    if (Date.now() >= deadline) {
      walletDebug('solana:status-timeout', { signature })
      return
    }
    await delay(SOLANA_STATUS_POLL_INTERVAL_MS)
  }
}

export async function sendSolanaWalletPayment(
  input: SendWalletPaymentInput,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
): Promise<SentWalletPayment> {
  const web3 = await loadSolanaWeb3()
  const provider = input.provider as SolanaWalletProvider
  const payer = publicKeyFromString(
    web3,
    input.fromAddress ?? (await requestSolanaPublicKey(provider)),
  )
  const recipient = publicKeyFromString(web3, instruction.address)
  const mint = publicKeyFromString(web3, token.address)
  const amountUnits = parseTokenAmount(input.amount, token.decimals)
  const preferLocalSend = Boolean(input.solanaConnection || input.solanaRpcUrl)
  walletDebug('solana:setup', {
    payer: payer.toBase58(),
    mint: mint.toBase58(),
    amountUnits: amountUnits.toString(),
    rpcUrl: input.solanaConnection
      ? '(custom connection)'
      : (input.solanaRpcUrl ?? SOLANA_MAINNET_RPC_URL),
    preferLocalSend,
  })
  const connection =
    input.solanaConnection ??
    new web3.Connection(input.solanaRpcUrl ?? SOLANA_MAINNET_RPC_URL, 'confirmed')
  const tokenProgramId = new web3.PublicKey(SOLANA_TOKEN_PROGRAM_ID_BASE58)
  const associatedTokenProgramId = new web3.PublicKey(SOLANA_ASSOCIATED_TOKEN_PROGRAM_ID_BASE58)
  const sourceTokenAccount = findAssociatedTokenAddress(
    web3,
    payer,
    mint,
    tokenProgramId,
    associatedTokenProgramId,
  )
  const destinationTokenAccount = findAssociatedTokenAddress(
    web3,
    recipient,
    mint,
    tokenProgramId,
    associatedTokenProgramId,
  )
  walletDebug('solana:token-accounts', {
    source: sourceTokenAccount.toBase58(),
    destination: destinationTokenAccount.toBase58(),
  })
  const latest = await connection.getLatestBlockhash()
  walletDebug('solana:blockhash', { blockhash: latest.blockhash })
  const transaction = new web3.Transaction({
    feePayer: payer,
    recentBlockhash: latest.blockhash,
  })

  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      web3,
      payer,
      destinationTokenAccount,
      recipient,
      mint,
      tokenProgramId,
      associatedTokenProgramId,
    ),
  )
  transaction.add(
    createSplTokenTransferCheckedInstruction(
      web3,
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
      payer,
      amountUnits,
      token.decimals,
      tokenProgramId,
    ),
  )

  // 调用方显式提供 RPC/connection（如 playground devnet）时，锁定到目标 cluster 并本地广播，
  // 避免钱包按当前所选网络提交；详见 sendSolanaTransaction。
  const txHash = await sendSolanaTransaction(provider, connection, transaction, preferLocalSend)
  // 拿到签名后不阻塞：签名状态查询在后台进行（confirmation promise 将结果通知调用方）。
  const confirmation = confirmSolanaTransactionSuccess(connection, txHash)
  confirmation.catch(() => {})
  return {
    ...buildSentPayment(txHash, instruction, token, payer.toBase58(), input.amount, amountUnits),
    confirmation,
  }
}
