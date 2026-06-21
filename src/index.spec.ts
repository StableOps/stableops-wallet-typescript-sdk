import { PublicKey, Transaction } from '@solana/web3.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  EvmWalletChainConfigs,
  StableOpsWalletError,
  encodeErc20Transfer,
  getInjectedTronProvider,
  isWalletSdkDebugEnabled,
  parseTokenAmount,
  selectWalletPaymentInstruction,
  sendOrderWalletPayment,
  sendWalletPayment,
  setWalletSdkDebug,
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

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    this.signedTransaction = transaction
    return { serialize: () => new Uint8Array([1, 2, 3]) } as unknown as Transaction
  }
}

const solanaConnection = {
  async getLatestBlockhash() {
    return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }
  },
  async sendRawTransaction() {
    return 'SOLANA_SIGNATURE'
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

  it('TronLink 授权后 defaultAddress 延迟就绪时轮询等待而非误报地址无效', async () => {
    // 复刻 TronLink 真机行为：tron_requestAccounts 返回时 base58 仍为 false，稍后才写好。
    const tronWeb = {
      defaultAddress: { base58: false as string | false },
      transactionBuilder: {
        triggerSmartContract: async () => ({ transaction: { raw_data: {} } }),
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'TRON_TX_ID' }),
        sendRawTransaction: async () => ({ result: true, txid: 'TRON_TX_HASH' }),
      },
    }
    const provider = {
      tronWeb,
      tronLink: {
        request: async <T>(args: { method: string }) => {
          if (args.method === 'tron_requestAccounts') {
            // 授权返回后异步写入地址（早于轮询预算到期）。
            setTimeout(() => {
              tronWeb.defaultAddress.base58 = 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R'
            }, 50)
          }
          return { code: 200 } as T
        },
      },
    }

    const result = await sendWalletPayment({
      provider,
      amount: '1',
      instruction: {
        chain: 'tron',
        asset: 'USDT',
        address: 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN',
      },
    })

    expect(result.fromAddress).toBe('TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R')
    expect(result.txHash).toBe('TRON_TX_HASH')
  })

  it('TronLink 替换全局 tronWeb 时不被 provider 缓存的旧对象挡住', async () => {
    const staleTronWeb = {
      defaultAddress: { base58: false as string | false },
      transactionBuilder: {
        triggerSmartContract: async () => {
          throw new Error('stale tronWeb should not be used')
        },
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'STALE_TX_ID' }),
        sendRawTransaction: async () => ({ txid: 'STALE_TX_HASH' }),
      },
    }
    const readyTronWeb = {
      defaultAddress: { base58: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R' },
      transactionBuilder: {
        triggerSmartContract: async () => ({ transaction: { raw_data: {} } }),
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'TRON_TX_ID' }),
        sendRawTransaction: async () => ({ txid: 'TRON_TX_HASH' }),
      },
    }
    const provider = {
      tronWeb: staleTronWeb,
      tronLink: {
        request: async <T>() => {
          setTimeout(() => {
            Object.assign(globalThis, { tronWeb: readyTronWeb })
          }, 50)
          return { code: 200 } as T
        },
      },
    }
    Object.assign(globalThis, { tronWeb: staleTronWeb })

    try {
      const result = await sendWalletPayment({
        provider,
        amount: '1',
        instruction: {
          chain: 'tron-nile',
          asset: 'USDT',
          address: 'TBpYsqR9qpFT8m36GBH572TSu4phguFfz1',
        },
      })

      expect(result.txHash).toBe('TRON_TX_HASH')
      expect(result.fromAddress).toBe('TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R')
    } finally {
      Reflect.deleteProperty(globalThis, 'tronWeb')
    }
  })

  it('TronLink 只暴露 defaultAddress.hex 时转换为 base58 付款方地址', async () => {
    const calls: string[] = []
    const tronWeb = {
      defaultAddress: {
        base58: false as string | false,
        hex: '4146f1eaa1d7c4a4e4f9923a24dd8a69a2b4e7f3ab',
      },
      address: {
        fromHex: (hex: string) => {
          calls.push(`fromHex:${hex}`)
          return 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R'
        },
      },
      transactionBuilder: {
        triggerSmartContract: async (
          _contractAddress: string,
          _functionSelector: string,
          _options: Record<string, unknown>,
          _parameters: Array<{ type: string; value: string | bigint }>,
          issuerAddress?: string,
        ) => {
          calls.push(`issuer:${issuerAddress ?? ''}`)
          return { transaction: { raw_data: {} } }
        },
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'TRON_TX_ID' }),
        sendRawTransaction: async () => ({ result: true, txid: 'TRON_TX_HASH' }),
      },
    }

    const result = await sendWalletPayment({
      provider: { tronWeb },
      amount: '1',
      instruction: {
        chain: 'tron-nile',
        asset: 'USDT',
        address: 'TBpYsqR9qpFT8m36GBH572TSu4phguFfz1',
      },
    })

    expect(result.fromAddress).toBe('TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R')
    expect(calls).toEqual([
      'fromHex:4146f1eaa1d7c4a4e4f9923a24dd8a69a2b4e7f3ab',
      'issuer:TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R',
    ])
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

  it('显式指定 connection 时优先 signTransaction 并自行广播到目标 cluster', async () => {
    // 模拟 Phantom 这类同时支持 signAndSendTransaction 与 signTransaction 的钱包：
    // 给了 devnet connection 后应走「仅签名 + 自有 connection 广播」，避免钱包用其选中网络（默认主网）提交。
    const calls: string[] = []
    const provider: SolanaWalletProvider = {
      publicKey: new PublicKey('11111111111111111111111111111112'),
      async signAndSendTransaction() {
        calls.push('signAndSendTransaction')
        return { signature: 'WALLET_NETWORK_SIGNATURE' }
      },
      async signTransaction(_transaction: Transaction) {
        calls.push('signTransaction')
        // 桩：真机由钱包私钥签名；这里只需返回可 serialize 的对象供本地广播。
        return { serialize: () => new Uint8Array([1, 2, 3]) } as unknown as Transaction
      },
    }
    const devnetConnection = {
      async getLatestBlockhash() {
        return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }
      },
      async sendRawTransaction() {
        calls.push('sendRawTransaction')
        return 'DEVNET_SIGNATURE'
      },
    }

    const result = await sendWalletPayment({
      provider,
      amount: '1',
      solanaConnection: devnetConnection,
      instruction: {
        chain: 'solana-devnet',
        asset: 'USDC',
        address: 'So11111111111111111111111111111111111111112',
      },
    })

    expect(result.txHash).toBe('DEVNET_SIGNATURE')
    expect(calls).toEqual(['signTransaction', 'sendRawTransaction'])
  })

  it('显式指定 Solana RPC 但钱包不支持 signTransaction 时给出明确错误', async () => {
    const calls: string[] = []
    const provider: SolanaWalletProvider = {
      publicKey: new PublicKey('11111111111111111111111111111112'),
      async signAndSendTransaction() {
        calls.push('signAndSendTransaction')
        return { signature: 'WALLET_NETWORK_SIGNATURE' }
      },
    }
    const devnetConnection = {
      async getLatestBlockhash() {
        return { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1 }
      },
      async sendRawTransaction() {
        calls.push('sendRawTransaction')
        return 'DEVNET_SIGNATURE'
      },
    }

    await expect(
      sendWalletPayment({
        provider,
        amount: '1',
        solanaConnection: devnetConnection,
        instruction: {
          chain: 'solana-devnet',
          asset: 'USDC',
          address: 'So11111111111111111111111111111111111111112',
        },
      }),
    ).rejects.toMatchObject({ code: 'wallet_provider_mismatch' })
    expect(calls).toEqual([])
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

describe('注入钱包 provider', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'tronLink')
    Reflect.deleteProperty(globalThis, 'tronWeb')
  })

  it('TRON 优先使用 tronLink.tronWeb，避免读取到未就绪的 window.tronWeb', () => {
    const staleTronWeb = {
      defaultAddress: { base58: false as string | false },
      transactionBuilder: { triggerSmartContract: async () => ({ transaction: {} }) },
      trx: {
        sign: async (transaction: unknown) => transaction,
        sendRawTransaction: async () => ({ txid: 'STALE' }),
      },
    }
    const readyTronWeb = {
      defaultAddress: { base58: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R' },
      transactionBuilder: { triggerSmartContract: async () => ({ transaction: {} }) },
      trx: {
        sign: async (transaction: unknown) => transaction,
        sendRawTransaction: async () => ({ txid: 'READY' }),
      },
    }
    Object.assign(globalThis, {
      tronWeb: staleTronWeb,
      tronLink: {
        tronWeb: readyTronWeb,
        request: async () => ({ code: 200 }),
      },
    })

    const provider = getInjectedTronProvider()

    expect((provider as { tronWeb?: unknown } | undefined)?.tronWeb).toBe(readyTronWeb)
  })

  it('TRON 仅注入 tronLink.request 时仍注册 provider，等待授权后读取 tronWeb', async () => {
    const readyTronWeb = {
      defaultAddress: { base58: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R' },
      transactionBuilder: {
        triggerSmartContract: async () => ({ transaction: { raw_data: {} } }),
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'TRON_TX_ID' }),
        sendRawTransaction: async () => ({ txid: 'TRON_TX_HASH' }),
      },
    }
    const tronLink = {
      request: async () => {
        Object.assign(tronLink, { tronWeb: readyTronWeb })
        return { code: 200 }
      },
    }
    Object.assign(globalThis, { tronLink })

    const provider = getInjectedTronProvider()

    expect(provider).toBeDefined()
    const result = await sendWalletPayment({
      provider: provider as NonNullable<typeof provider>,
      amount: '1',
      instruction: {
        chain: 'tron-nile',
        asset: 'USDT',
        address: 'TBpYsqR9qpFT8m36GBH572TSu4phguFfz1',
      },
    })
    expect(result.txHash).toBe('TRON_TX_HASH')
  })

  it('TRON 授权返回后延迟注入 window.tronWeb 时等待 provider 就绪', async () => {
    const readyTronWeb = {
      defaultAddress: { base58: 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R' },
      transactionBuilder: {
        triggerSmartContract: async () => ({ transaction: { raw_data: {} } }),
      },
      trx: {
        sign: async (transaction: unknown) => ({ transaction, txID: 'TRON_TX_ID' }),
        sendRawTransaction: async () => ({ txid: 'TRON_TX_HASH' }),
      },
    }
    Object.assign(globalThis, {
      tronLink: {
        request: async () => {
          setTimeout(() => {
            Object.assign(globalThis, { tronWeb: readyTronWeb })
          }, 50)
          return { code: 200 }
        },
      },
    })

    const provider = getInjectedTronProvider()

    expect(provider).toBeDefined()
    const result = await sendWalletPayment({
      provider: provider as NonNullable<typeof provider>,
      amount: '1',
      instruction: {
        chain: 'tron-nile',
        asset: 'USDT',
        address: 'TE9mRnhfxMe86fFVrCRtEfXukqMvRVfq9A',
      },
    })
    expect(result.txHash).toBe('TRON_TX_HASH')
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

describe('Optimism / BSC 钱包支持', () => {
  it('eip155 chain id 正确', () => {
    expect(EvmWalletChainConfigs['optimism'].eip155ChainId).toBe(10)
    expect(EvmWalletChainConfigs['optimism-sepolia'].eip155ChainId).toBe(11155420)
    expect(EvmWalletChainConfigs['bsc'].eip155ChainId).toBe(56)
  })

  it('BSC 链原生币是 BNB / decimals 18', () => {
    const cfg = EvmWalletChainConfigs['bsc']
    expect(cfg.nativeCurrency.symbol).toBe('BNB')
    expect(cfg.nativeCurrency.decimals).toBe(18)
  })

  it('不再落到 unsupported_chain / token_contract_not_found（含 BSC USDT 18 dec 路径）', async () => {
    for (const [chain, asset] of [
      ['optimism', 'USDC'],
      ['bsc', 'USDT'],
      ['bsc-testnet', 'USDC'],
      ['bsc-testnet', 'USDT'],
      ['optimism-sepolia', 'USDC'],
    ] as const) {
      let code = ''
      try {
        await sendWalletPayment({
          provider: {} as never,
          amount: '0.01',
          instruction: { chain, asset, address: '0x' + '1'.repeat(40) },
        })
      } catch (err) {
        code = err instanceof StableOpsWalletError ? err.code : 'other'
      }
      expect(code).not.toBe('unsupported_chain')
      expect(code).not.toBe('token_contract_not_found')
    }
  })
})

describe('debug 开关', () => {
  afterEach(() => {
    setWalletSdkDebug(false)
    vi.restoreAllMocks()
  })

  it('setWalletSdkDebug 控制 isWalletSdkDebugEnabled', () => {
    setWalletSdkDebug(true)
    expect(isWalletSdkDebugEnabled()).toBe(true)
    setWalletSdkDebug(false)
    expect(isWalletSdkDebugEnabled()).toBe(false)
  })

  it('关闭时不打日志，开启时输出带 [wallet-sdk] 前缀的日志', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

    setWalletSdkDebug(false)
    await sendWalletPayment({
      provider: new MockEvmProvider(),
      amount: '1',
      instruction: { chain: 'base', asset: 'USDC', address: '0x2222222222222222222222222222222222222222' },
    })
    expect(spy).not.toHaveBeenCalled()

    setWalletSdkDebug(true)
    await sendWalletPayment({
      provider: new MockEvmProvider(),
      amount: '1',
      instruction: { chain: 'base', asset: 'USDC', address: '0x2222222222222222222222222222222222222222' },
    })
    expect(spy).toHaveBeenCalled()
    expect(spy.mock.calls.every(([first]) => String(first).startsWith('[wallet-sdk] '))).toBe(true)
    expect(spy.mock.calls.some(([first]) => first === '[wallet-sdk] sendWalletPayment:start')).toBe(true)
  })
})
