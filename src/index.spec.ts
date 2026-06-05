import { PublicKey, Transaction } from '@solana/web3.js'
import { describe, expect, it } from 'vitest'

import {
  EvmWalletChainConfigs,
  StableOpsWalletError,
  encodeErc20Transfer,
  parseTokenAmount,
  selectWalletPaymentInstruction,
  sendOrderWalletPayment,
  sendWalletPayment,
  type Eip1193Provider,
  type SolanaWalletProvider,
} from './index'

class MockEvmProvider implements Eip1193Provider {
  readonly calls: { method: string; params?: unknown[] | Record<string, unknown> }[] = []

  constructor(private readonly options: { failSwitchOnce?: boolean } = {}) {}

  async request<T>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T> {
    this.calls.push(args)
    if (args.method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'] as T
    if (args.method === 'wallet_switchEthereumChain' && this.options.failSwitchOnce) {
      this.options.failSwitchOnce = false
      const err = new Error('unknown chain') as Error & { code: number }
      err.code = 4902
      throw err
    }
    if (args.method === 'eth_sendTransaction') return '0xTXHASH' as T
    return undefined as T
  }
}

class MockTronProvider {
  readonly calls: string[] = []
  readonly tronLink = {
    request: async <T>(args: { method: string }) => {
      this.calls.push(args.method)
      return { code: 200 } as T
    },
  }

  readonly tronWeb = {
    defaultAddress: { base58: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R' },
    transactionBuilder: {
      triggerSmartContract: async (
        contractAddress: string,
        functionSelector: string,
        options: Record<string, unknown>,
        parameters: Array<{ type: string; value: string | bigint }>,
        issuerAddress?: string,
      ) => {
        this.calls.push('triggerSmartContract')
        expect(contractAddress).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
        expect(functionSelector).toBe('transfer(address,uint256)')
        expect(options).toEqual({ feeLimit: 100_000_000 })
        expect(parameters).toEqual([
          { type: 'address', value: 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN' },
          { type: 'uint256', value: '2500000' },
        ])
        expect(issuerAddress).toBe('TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R')
        return { transaction: { raw_data: {} } }
      },
    },
    trx: {
      sign: async (transaction: unknown) => {
        this.calls.push('sign')
        return { transaction, txID: 'TRON_TX_ID' }
      },
      sendRawTransaction: async () => {
        this.calls.push('sendRawTransaction')
        return { result: true, txid: 'TRON_TX_HASH' }
      },
    },
  }
}

class MockSolanaProvider implements SolanaWalletProvider {
  readonly publicKey = new PublicKey('11111111111111111111111111111112')
  signedTransaction?: Transaction

  async signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }> {
    this.signedTransaction = transaction
    return { signature: 'SOLANA_SIGNATURE' }
  }
}

const solanaConnection = {
  async getLatestBlockhash() {
    return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }
  },
  async sendRawTransaction() {
    return 'unused'
  },
}

describe('parseTokenAmount', () => {
  it('按代币精度转换十进制金额', () => {
    expect(parseTokenAmount('12.34', 6)).toBe(12_340_000n)
    expect(parseTokenAmount('1', 6)).toBe(1_000_000n)
  })

  it('拒绝无效金额和超精度金额', () => {
    expect(() => parseTokenAmount('0', 6)).toThrow(StableOpsWalletError)
    expect(() => parseTokenAmount('1.0000001', 6)).toThrow(StableOpsWalletError)
    expect(() => parseTokenAmount('abc', 6)).toThrow(StableOpsWalletError)
  })
})

describe('encodeErc20Transfer', () => {
  it('生成 ERC-20 transfer(address,uint256) calldata', () => {
    expect(
      encodeErc20Transfer('0x2222222222222222222222222222222222222222', 1_000_000n),
    ).toBe(
      '0xa9059cbb000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000f4240',
    )
  })
})

describe('sendWalletPayment', () => {
  it('连接注入钱包、切到 EVM 订单链并发起 USDC 转账', async () => {
    const provider = new MockEvmProvider()

    const result = await sendWalletPayment({
      provider,
      amount: '10.5',
      instruction: {
        chain: 'base',
        asset: 'USDC',
        address: '0x2222222222222222222222222222222222222222',
      },
    })

    expect(result).toMatchObject({
      txHash: '0xTXHASH',
      chain: 'base',
      asset: 'USDC',
      fromAddress: '0x1111111111111111111111111111111111111111',
      toAddress: '0x2222222222222222222222222222222222222222',
      amountUnits: '10500000',
    })
    expect(provider.calls.map((call) => call.method)).toEqual([
      'eth_requestAccounts',
      'wallet_switchEthereumChain',
      'eth_sendTransaction',
    ])
    expect(provider.calls[1]?.params).toEqual([{ chainId: '0x2105' }])
  })

  it('EVM 钱包缺链时先添加网络再切链', async () => {
    const provider = new MockEvmProvider({ failSwitchOnce: true })

    await sendWalletPayment({
      provider,
      amount: '1',
      instruction: {
        chain: 'base-sepolia',
        asset: 'USDC',
        address: '0x2222222222222222222222222222222222222222',
      },
    })

    expect(provider.calls.map((call) => call.method)).toEqual([
      'eth_requestAccounts',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
      'eth_sendTransaction',
    ])
  })

  it('通过 TronLink / TronWeb 发起 TRC-20 转账', async () => {
    const provider = new MockTronProvider()

    const result = await sendWalletPayment({
      provider,
      amount: '2.5',
      instruction: {
        chain: 'tron',
        asset: 'USDT',
        address: 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN',
      },
    })

    expect(result).toMatchObject({
      txHash: 'TRON_TX_HASH',
      chain: 'tron',
      asset: 'USDT',
      fromAddress: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
      toAddress: 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN',
      amountUnits: '2500000',
    })
    expect(provider.calls).toEqual(['tron_requestAccounts', 'triggerSmartContract', 'sign', 'sendRawTransaction'])
  })

  it('通过 Solana wallet adapter 发起 SPL Token 转账', async () => {
    const provider = new MockSolanaProvider()
    const recipient = 'So11111111111111111111111111111111111111112'

    const result = await sendWalletPayment({
      provider,
      amount: '3.75',
      solanaConnection,
      instruction: {
        chain: 'solana',
        asset: 'USDC',
        address: recipient,
      },
    })

    expect(result).toMatchObject({
      txHash: 'SOLANA_SIGNATURE',
      chain: 'solana',
      asset: 'USDC',
      fromAddress: '11111111111111111111111111111112',
      toAddress: recipient,
      amountUnits: '3750000',
    })
    expect(provider.signedTransaction?.instructions).toHaveLength(2)
    expect(provider.signedTransaction?.instructions[0]?.programId.toBase58()).toBe(
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    )
    expect(provider.signedTransaction?.instructions[1]?.programId.toBase58()).toBe(
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    )
  })

  it('拒绝链与资产不匹配的支付指令', async () => {
    await expect(
      sendWalletPayment({
        provider: new MockEvmProvider(),
        amount: '1',
        instruction: { chain: 'tron', asset: 'USDC', address: 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN' },
      }),
    ).rejects.toMatchObject({ code: 'token_contract_not_found' })
  })
})

describe('多候选订单支付', () => {
  it('根据候选顺序和已连接钱包选择可支付指令', () => {
    const evmProvider = new MockEvmProvider()

    const selected = selectWalletPaymentInstruction(
      [
        { chain: 'tron', asset: 'USDT', address: 'TTron' },
        { chain: 'base', asset: 'USDC', address: '0x2222222222222222222222222222222222222222' },
      ],
      { base: evmProvider },
    )

    expect(selected).toEqual({
      instruction: { chain: 'base', asset: 'USDC', address: '0x2222222222222222222222222222222222222222' },
      provider: evmProvider,
    })
  })

  it('sendOrderWalletPayment 使用候选列表中已有钱包支持的链支付', async () => {
    const provider = new MockEvmProvider()

    const result = await sendOrderWalletPayment({
      providers: { base: provider },
      order: {
        amount: '1',
        paymentInstructions: [
          { chain: 'tron', asset: 'USDT', address: 'TTron' },
          { chain: 'base', asset: 'USDC', address: '0x2222222222222222222222222222222222222222' },
        ],
      },
    })

    expect(result).toMatchObject({
      txHash: '0xTXHASH',
      chain: 'base',
      asset: 'USDC',
    })
  })
})

describe('测试网钱包支持', () => {
  it('新 EVM 测试网有切链配置（eip155 正确）', () => {
    expect(EvmWalletChainConfigs['ethereum-sepolia'].eip155ChainId).toBe(11155111)
    expect(EvmWalletChainConfigs['arbitrum-sepolia'].eip155ChainId).toBe(421614)
    expect(EvmWalletChainConfigs['polygon-amoy'].eip155ChainId).toBe(80002)
  })

  it('tron-nile / solana-devnet 不再落到 unsupported_chain', async () => {
    // 缺少真实 provider 会在分流之后、调用钱包时抛错；
    // 只断言错误码不是 unsupported_chain（即分流已识别测试网家族）。
    for (const chain of ['tron-nile', 'solana-devnet'] as const) {
      const asset = chain === 'tron-nile' ? 'USDT' : 'USDC'
      let code = ''
      try {
        await sendWalletPayment({
          provider: {} as never,
          amount: '0.01',
          instruction: { chain, asset, address: 'x' },
        })
      } catch (err) {
        code = err instanceof StableOpsWalletError ? err.code : 'other'
      }
      expect(code).not.toBe('unsupported_chain')
      expect(code).not.toBe('token_contract_not_found')
    }
  })
})
