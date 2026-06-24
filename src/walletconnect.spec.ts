import { beforeEach, describe, expect, it, vi } from 'vitest'

// 用 vi.hoisted 暴露 mock 状态,让每个测试用例可以读写 init / enable 行为。
const wcMock = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  type FakeProvider = {
    calls: Array<{ method: string; params?: unknown[] | Record<string, unknown> }>
    listeners: Map<string, Set<Listener>>
    disconnected: boolean
    request: (args: {
      method: string
      params?: unknown[] | Record<string, unknown>
    }) => Promise<unknown>
    enable: () => Promise<string[]>
    disconnect: () => Promise<void>
    on: (event: string, cb: Listener) => FakeProvider
    removeListener: (event: string, cb: Listener) => FakeProvider
    emit: (event: string, ...args: unknown[]) => void
  }

  const state = {
    initCalls: 0,
    initOpts: undefined as Record<string, unknown> | undefined,
    fakeProvider: undefined as FakeProvider | undefined,
    enableError: null as unknown,
    initError: null as unknown,
    accounts: ['0x1111111111111111111111111111111111111111'],
  }

  const makeFakeProvider = (): FakeProvider => {
    const listeners = new Map<string, Set<Listener>>()
    const provider: FakeProvider = {
      calls: [],
      listeners,
      disconnected: false,
      async request(args) {
        provider.calls.push(args)
        if (args.method === 'eth_requestAccounts') return state.accounts
        if (args.method === 'wallet_switchEthereumChain') return null
        if (args.method === 'eth_sendTransaction') return '0xTXHASH'
        if (args.method === 'eth_getTransactionReceipt') return { status: '0x1' }
        return null
      },
      async enable() {
        if (state.enableError) throw state.enableError
        return state.accounts
      },
      async disconnect() {
        provider.disconnected = true
      },
      on(event, cb) {
        const set = listeners.get(event) ?? new Set<Listener>()
        set.add(cb)
        listeners.set(event, set)
        return provider
      },
      removeListener(event, cb) {
        listeners.get(event)?.delete(cb)
        return provider
      },
      emit(event, ...args) {
        listeners.get(event)?.forEach((cb) => cb(...args))
      },
    }
    return provider
  }

  return { state, makeFakeProvider }
})

vi.mock('@walletconnect/ethereum-provider', () => ({
  EthereumProvider: {
    init: vi.fn(async (opts: Record<string, unknown>) => {
      wcMock.state.initCalls++
      wcMock.state.initOpts = opts
      if (wcMock.state.initError) throw wcMock.state.initError
      const p = wcMock.makeFakeProvider()
      wcMock.state.fakeProvider = p
      return p
    }),
  },
}))

// SDK 必须在 vi.mock 之后 import,以确保拿到被 mock 的依赖。
import {
  createWalletConnectConnection,
  EvmWalletChainConfigs,
  sendOrderWalletPayment,
  StableOpsWalletError,
} from './index'

const METADATA = {
  name: 'Test App',
  description: 'spec',
  url: 'https://example.com',
  icons: ['https://example.com/icon.png'],
}

beforeEach(() => {
  wcMock.state.initCalls = 0
  wcMock.state.initOpts = undefined
  wcMock.state.fakeProvider = undefined
  wcMock.state.enableError = null
  wcMock.state.initError = null
  wcMock.state.accounts = ['0x1111111111111111111111111111111111111111']
})

describe('createWalletConnectConnection — 入口校验', () => {
  it('缺 projectId 抛 walletconnect_project_id_missing 且不触发 dynamic import', async () => {
    await expect(
      createWalletConnectConnection({ projectId: '', metadata: METADATA }),
    ).rejects.toMatchObject({ code: 'walletconnect_project_id_missing' })
    expect(wcMock.state.initCalls).toBe(0)
  })
})

describe('createWalletConnectConnection — chains / rpcMap 派生', () => {
  it('默认 chains 覆盖全部 12 条 EVM 链,optionalChains 与 rpcMap 由 EvmWalletChainConfigs 派生', async () => {
    const conn = await createWalletConnectConnection({ projectId: 'pid', metadata: METADATA })
    await conn.connect()

    const optionalChains = wcMock.state.initOpts?.optionalChains as number[]
    expect(optionalChains).toHaveLength(12)
    expect(optionalChains).toContain(EvmWalletChainConfigs.ethereum.eip155ChainId)
    expect(optionalChains).toContain(EvmWalletChainConfigs.base.eip155ChainId)

    const rpcMap = wcMock.state.initOpts?.rpcMap as Record<number, string>
    expect(rpcMap[EvmWalletChainConfigs.base.eip155ChainId]).toBe(
      EvmWalletChainConfigs.base.rpcUrls[0],
    )
  })

  it('入参 chains 子集只派生这些链;入参 rpcMap 覆盖同 key 的默认值', async () => {
    const conn = await createWalletConnectConnection({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base', 'arbitrum'],
      rpcMap: { 8453: 'https://custom-base-rpc' },
    })
    await conn.connect()

    expect(wcMock.state.initOpts?.optionalChains).toEqual([
      EvmWalletChainConfigs.base.eip155ChainId,
      EvmWalletChainConfigs.arbitrum.eip155ChainId,
    ])
    const rpcMap = wcMock.state.initOpts?.rpcMap as Record<number, string>
    expect(rpcMap).toEqual({
      8453: 'https://custom-base-rpc',
      [EvmWalletChainConfigs.arbitrum.eip155ChainId]: EvmWalletChainConfigs.arbitrum.rpcUrls[0],
    })
  })
})

describe('createWalletConnectConnection — connect / providers', () => {
  it('connect() 返回钱包账户,重复 connect 不重复 init', async () => {
    const conn = await createWalletConnectConnection({ projectId: 'pid', metadata: METADATA })
    const a = await conn.connect()
    const b = await conn.connect()
    expect(a).toEqual(wcMock.state.accounts)
    expect(b).toEqual(wcMock.state.accounts)
    expect(wcMock.state.initCalls).toBe(1)
  })

  it('providers 把所请求的每条 EVM 链都指向同一个 provider 实例', async () => {
    const conn = await createWalletConnectConnection({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base', 'ethereum'],
    })
    await conn.connect()
    expect(conn.providers.base).toBe(wcMock.state.fakeProvider)
    expect(conn.providers.ethereum).toBe(wcMock.state.fakeProvider)
    expect(conn.providers.tron).toBeUndefined()
    expect(conn.providers.solana).toBeUndefined()
  })

  it('enable() 抛错被包装为 walletconnect_connect_failed,cause 透传 EIP-1193 4001', async () => {
    const userRejected = Object.assign(new Error('User rejected'), { code: 4001 })
    wcMock.state.enableError = userRejected

    const conn = await createWalletConnectConnection({ projectId: 'pid', metadata: METADATA })
    const err = await conn.connect().catch((e: unknown) => e)

    expect(err).toBeInstanceOf(StableOpsWalletError)
    expect(err).toMatchObject({ code: 'walletconnect_connect_failed' })
    // native cause 与 details.cause 都指向原始错误,前者让 apps/web 的 isUserRejectedWalletError
    // (查 error.cause?.code) 仍能识别用户取消。
    expect((err as Error & { cause?: unknown }).cause).toBe(userRejected)
    expect((err as StableOpsWalletError).details).toEqual({ cause: userRejected })
  })
})

describe('createWalletConnectConnection — onDisplayUri', () => {
  it('订阅 display_uri 事件;返回的 unsubscribe 调用 removeListener', async () => {
    const conn = await createWalletConnectConnection({ projectId: 'pid', metadata: METADATA })
    await conn.connect() // 触发 init,让 fakeProvider 就位

    const received: string[] = []
    const off = conn.onDisplayUri((uri) => received.push(uri))
    // onDisplayUri 内部异步 attach,等下一轮微任务。
    await Promise.resolve()
    await Promise.resolve()

    wcMock.state.fakeProvider?.emit('display_uri', 'wc:test-uri')
    expect(received).toEqual(['wc:test-uri'])

    off()
    wcMock.state.fakeProvider?.emit('display_uri', 'wc:another')
    expect(received).toEqual(['wc:test-uri'])
  })
})

describe('createWalletConnectConnection — 端到端 sendOrderWalletPayment', () => {
  it('connect 后把 providers 喂给 sendOrderWalletPayment,走通一条 base 支付', async () => {
    const conn = await createWalletConnectConnection({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })
    await conn.connect()

    const result = await sendOrderWalletPayment({
      order: {
        amount: '10.5',
        paymentInstructions: [
          {
            chain: 'base',
            asset: 'USDC',
            address: '0x2222222222222222222222222222222222222222',
          },
        ],
      },
      providers: conn.providers,
    })

    expect(result).toMatchObject({
      txHash: '0xTXHASH',
      chain: 'base',
      asset: 'USDC',
      fromAddress: '0x1111111111111111111111111111111111111111',
      toAddress: '0x2222222222222222222222222222222222222222',
      amountUnits: '10500000',
    })
    expect(wcMock.state.fakeProvider?.calls.map((c) => c.method)).toEqual([
      'eth_requestAccounts',
      'wallet_switchEthereumChain',
      'eth_sendTransaction',
      'eth_getTransactionReceipt',
    ])
    await result.confirmation
  })
})

describe('createWalletConnectConnection — disconnect', () => {
  it('disconnect 调用 provider.disconnect,后续 connect 仍可工作(重新 init)', async () => {
    const conn = await createWalletConnectConnection({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })
    await conn.connect()
    const firstProvider = wcMock.state.fakeProvider!
    expect(conn.providers.base).toBe(firstProvider)

    await conn.disconnect()
    expect(firstProvider.disconnected).toBe(true)
    expect(conn.providers.base).toBeUndefined()

    // 重连应触发新 init,生成新 provider 实例。
    await conn.connect()
    expect(wcMock.state.initCalls).toBe(2)
    expect(conn.providers.base).toBe(wcMock.state.fakeProvider)
    expect(wcMock.state.fakeProvider).not.toBe(firstProvider)
  })
})
