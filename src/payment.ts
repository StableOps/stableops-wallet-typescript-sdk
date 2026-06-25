import { StableOpsWalletError, walletDebug } from './errors'
import { isEvmWalletChain, isTronWalletChain, isSolanaWalletChain } from './chains'
import { findWalletTokenContract } from './tokens'
import { sendEvmWalletPayment } from './evm'
import { sendTronWalletPayment } from './tron'
import { sendSolanaWalletPayment } from './solana'
import { requireInstruction } from './helpers'
import type {
  ChainId,
  SendOrderWalletPaymentInput,
  SendWalletPaymentInput,
  SentWalletPayment,
  WalletPaymentInstruction,
  WalletProvider,
  WalletProviderByChain,
} from './types'

export function selectWalletPaymentInstruction(
  instructions: readonly WalletPaymentInstruction[],
  providers: WalletProviderByChain,
  preferredChains: readonly ChainId[] = [],
): { instruction: WalletPaymentInstruction; provider: WalletProvider } {
  if (instructions.length === 0) {
    throw new StableOpsWalletError(
      'No payable on-chain payment instruction found for this order',
      'payment_instruction_not_found',
    )
  }
  const preferred = preferredChains
    .map((chain) => instructions.find((instruction) => instruction.chain === chain))
    .filter((instruction): instruction is WalletPaymentInstruction => Boolean(instruction))
  const candidates = [
    ...preferred,
    ...instructions.filter((instruction) => !preferred.includes(instruction)),
  ]
  for (const instruction of candidates) {
    const provider = providers[instruction.chain]
    if (provider) return { instruction, provider }
  }
  throw new StableOpsWalletError(
    'No wallet provider found for any candidate chain in the order',
    'wallet_provider_not_found',
    {
      chains: instructions.map((instruction) => instruction.chain),
    },
  )
}

export async function sendOrderWalletPayment(
  input: SendOrderWalletPaymentInput,
): Promise<SentWalletPayment> {
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
    throw new StableOpsWalletError(
      'No default token contract found for this chain and asset',
      'token_contract_not_found',
      {
        chain: instruction.chain,
        asset: instruction.asset,
      },
    )
  }

  walletDebug('sendWalletPayment:start', {
    chain: instruction.chain,
    asset: instruction.asset,
    amount: input.amount,
    toAddress: instruction.address,
    tokenContract: token.address,
    decimals: token.decimals,
  })

  try {
    let sent: SentWalletPayment
    if (isEvmWalletChain(instruction.chain)) {
      sent = await sendEvmWalletPayment(input, { ...instruction, chain: instruction.chain }, token)
    } else if (isTronWalletChain(instruction.chain)) {
      sent = await sendTronWalletPayment(input, instruction, token)
    } else if (isSolanaWalletChain(instruction.chain)) {
      sent = await sendSolanaWalletPayment(input, instruction, token)
    } else {
      throw new StableOpsWalletError(
        'The wallet SDK does not support this chain',
        'unsupported_chain',
        {
          chain: instruction.chain,
        },
      )
    }
    walletDebug('sendWalletPayment:sent', {
      chain: sent.chain,
      txHash: sent.txHash,
      fromAddress: sent.fromAddress,
    })
    return sent
  } catch (err) {
    walletDebug('sendWalletPayment:error', {
      chain: instruction.chain,
      code: err instanceof StableOpsWalletError ? err.code : undefined,
      message: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
