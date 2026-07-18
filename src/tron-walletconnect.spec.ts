import { beforeEach, describe, expect, it, vi } from 'vitest'

// mock tronweb 模块：拦截 lazy.ts 的动态 import，记录构造参数与各步调用。
const tronWebMock = vi.hoisted(() => {
  const state = {
    fullHosts: [] as string[],
    buildCalls: [] as unknown[][],
    broadcasted: [] as unknown[],
    buildResponse: {} as Record<string, unknown>,
    broadcastResponse: {} as Record<string, unknown>,
    infoResponse: {} as Record<string, unknown>,
  }

  class TronWeb {
    transactionBuilder = {
      triggerSmartContract: async (...args: unknown[]) => {
        state.buildCalls.push(args)
        return state.buildResponse
      },
    }

    trx = {
      sign: async () => {
        throw new Error('WalletConnect path must not call tronWeb.trx.sign')
      },
      sendRawTransaction: async (signed: unknown) => {
        state.broadcasted.push(signed)
        return state.broadcastResponse
      },
      getTransactionInfo: async () => state.infoResponse,
    }

    constructor(options: { fullHost: string }) {
      state.fullHosts.push(options.fullHost)
    }
  }

  return { state, TronWeb }
})

vi.mock('tronweb', () => ({ TronWeb: tronWebMock.TronWeb }))

import { sendWalletPayment } from './index'

const WC_ACCOUNT = 'TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R'
const RECIPIENT = 'TQjKJZmBEXMhmnpfjfJ6bJrY3w6KNpqrCN'
const NILE_RECIPIENT = 'TBpYsqR9qpFT8m36GBH572TSu4phguFfz1'

function createWcTronProvider(
  chainId: 'tron:0x2b6653dc' | 'tron:0xcd8690dc' = 'tron:0x2b6653dc',
) {
  const signCalls: unknown[] = []
  const provider = {
    walletConnectTron: true as const,
    chainId,
    account: WC_ACCOUNT,
    signTransaction: async (transaction: unknown) => {
      signCalls.push(transaction)
      return { txID: 'WC_SIGNED_TX_ID', transaction }
    },
  }
  return { provider, signCalls }
}

beforeEach(() => {
  tronWebMock.state.fullHosts = []
  tronWebMock.state.buildCalls = []
  tronWebMock.state.broadcasted = []
  tronWebMock.state.buildResponse = { transaction: { raw_data: {}, txID: 'BUILT_TX_ID' } }
  tronWebMock.state.broadcastResponse = { result: true, txid: 'WC_TRON_TX_HASH' }
  tronWebMock.state.infoResponse = { receipt: { result: 'SUCCESS' } }
})

describe('WalletConnect TRON 支付路径', () => {
  it('构造 / 签名 / 广播全流程，默认用主网 trongrid 全节点', async () => {
    const { provider, signCalls } = createWcTronProvider()

    const result = await sendWalletPayment({
      provider,
      amount: '2.5',
      instruction: { chain: 'tron', asset: 'USDT', address: RECIPIENT },
    })

    expect(tronWebMock.state.fullHosts).toEqual(['https://api.trongrid.io'])
    expect(tronWebMock.state.buildCalls).toHaveLength(1)
    const [contract, selector, options, parameters, issuer] = tronWebMock.state.buildCalls[0]!
    expect(contract).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
    expect(selector).toBe('transfer(address,uint256)')
    expect(options).toEqual({ feeLimit: 100_000_000 })
    expect(parameters).toEqual([
      { type: 'address', value: RECIPIENT },
      { type: 'uint256', value: '2500000' },
    ])
    expect(issuer).toBe(WC_ACCOUNT)
    expect(signCalls).toEqual([{ raw_data: {}, txID: 'BUILT_TX_ID' }])
    expect(tronWebMock.state.broadcasted).toHaveLength(1)
    expect(result).toMatchObject({
      txHash: 'WC_TRON_TX_HASH',
      chain: 'tron',
      asset: 'USDT',
      fromAddress: WC_ACCOUNT,
      toAddress: RECIPIENT,
      amountUnits: '2500000',
    })
    await expect(result.confirmation).resolves.toBeUndefined()
  })

  it('tron-nile 默认用 nile 全节点，tronRpcUrl 可覆盖', async () => {
    const { provider } = createWcTronProvider('tron:0xcd8690dc')

    await sendWalletPayment({
      provider,
      amount: '1',
      instruction: { chain: 'tron-nile', asset: 'USDT', address: NILE_RECIPIENT },
    })
    expect(tronWebMock.state.fullHosts).toEqual(['https://nile.trongrid.io'])

    await sendWalletPayment({
      provider,
      amount: '1',
      tronRpcUrl: 'https://custom-node.example',
      instruction: { chain: 'tron-nile', asset: 'USDT', address: NILE_RECIPIENT },
    })
    expect(tronWebMock.state.fullHosts).toEqual([
      'https://nile.trongrid.io',
      'https://custom-node.example',
    ])
  })

  it('节点拒绝广播（{ code, message } 无 result 字段）时抛 tron_broadcast_failed 并解码 message', async () => {
    tronWebMock.state.broadcastResponse = {
      code: 'SIGERROR',
      txid: 'REJECTED_TX_ID',
      message: Buffer.from('validate signature error').toString('hex'),
    }
    const { provider } = createWcTronProvider()

    await expect(
      sendWalletPayment({
        provider,
        amount: '1',
        instruction: { chain: 'tron', asset: 'USDT', address: RECIPIENT },
      }),
    ).rejects.toMatchObject({
      code: 'tron_broadcast_failed',
      details: { message: 'validate signature error' },
    })
  })

  it('节点拒绝广播（result:false）时抛 tron_broadcast_failed', async () => {
    tronWebMock.state.broadcastResponse = { result: false, code: 'BANDWITH_ERROR' }
    const { provider } = createWcTronProvider()

    await expect(
      sendWalletPayment({
        provider,
        amount: '1',
        instruction: { chain: 'tron', asset: 'USDT', address: RECIPIENT },
      }),
    ).rejects.toMatchObject({ code: 'tron_broadcast_failed' })
  })

  it('钱包只签名不广播：交易签名结果原样交给 tronweb 广播', async () => {
    const { provider } = createWcTronProvider()

    await sendWalletPayment({
      provider,
      amount: '1',
      instruction: { chain: 'tron', asset: 'USDT', address: RECIPIENT },
    })

    expect(tronWebMock.state.broadcasted).toEqual([
      { txID: 'WC_SIGNED_TX_ID', transaction: { raw_data: {}, txID: 'BUILT_TX_ID' } },
    ])
  })
})
