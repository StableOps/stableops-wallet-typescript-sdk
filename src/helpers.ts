import { StableOpsWalletError } from './errors'
import { ERC20_TRANSFER_SELECTOR } from './chains'
import type { WalletPaymentInstruction, SentWalletPayment } from './types'
import type { WalletTokenContract } from './types'

export function normalizeEvmAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(address)) {
    throw new StableOpsWalletError('Invalid EVM address format', 'invalid_evm_address', {
      address,
    })
  }
  return address.toLowerCase()
}

export function padHex(hex: string): string {
  return hex.padStart(64, '0')
}

export function encodeErc20Transfer(toAddress: string, amountUnits: bigint): string {
  const normalizedTo = normalizeEvmAddress(toAddress)
  if (amountUnits < 0n) {
    throw new StableOpsWalletError('Transfer amount cannot be negative', 'invalid_amount', {
      amountUnits: amountUnits.toString(),
    })
  }
  return `0x${ERC20_TRANSFER_SELECTOR}${padHex(normalizedTo.slice(2))}${padHex(amountUnits.toString(16))}`
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new StableOpsWalletError('Invalid token decimal configuration', 'invalid_decimals', {
      decimals,
    })
  }

  const trimmed = amount.trim()
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(trimmed)
  if (!match) {
    throw new StableOpsWalletError('Invalid transfer amount format', 'invalid_amount', {
      amount,
    })
  }

  const whole = match[1]
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) {
    throw new StableOpsWalletError(
      'Transfer amount decimal places exceed token precision',
      'amount_precision_exceeded',
      {
        amount,
        decimals,
      },
    )
  }

  const units =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (units <= 0n) {
    throw new StableOpsWalletError('Transfer amount must be greater than 0', 'invalid_amount', {
      amount,
    })
  }
  return units
}

export function buildSentPayment(
  txHash: string,
  instruction: WalletPaymentInstruction,
  token: WalletTokenContract,
  fromAddress: string,
  amount: string,
  amountUnits: bigint,
): Omit<SentWalletPayment, 'confirmation'> {
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

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function requireInstruction(
  instruction: WalletPaymentInstruction | null,
): WalletPaymentInstruction {
  if (!instruction) {
    throw new StableOpsWalletError(
      'No payable on-chain payment instruction found for this order',
      'payment_instruction_not_found',
    )
  }
  return instruction
}
