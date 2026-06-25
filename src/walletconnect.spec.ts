import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    enableWait: undefined as Promise<void> | undefined,
    enableCalls: 0,
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
        state.enableCalls++
        if (state.enableError) throw state.enableError
        await state.enableWait
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
      const provider = wcMock.makeFakeProvider()
      wcMock.state.fakeProvider = provider
      return provider
    }),
  },
}))

import {
  createWalletConnectController,
  EvmWalletChainConfigs,
  sendOrderWalletPayment,
  StableOpsWalletError,
  type WalletConnectControllerState,
} from './index'

const METADATA = {
  name: 'StableOps Test',
  description: 'WalletConnect test app',
  url: 'https://example.com',
  icons: ['https://example.com/icon.png'],
}

const WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    iconUrl: 'https://example.com/metamask.png',
    links: {
      native: 'metamask://',
      universal: 'https://metamask.app.link',
    },
  },
  { id: 'rainbow', name: 'Rainbow' },
]

beforeEach(() => {
  wcMock.state.initCalls = 0
  wcMock.state.initOpts = undefined
  wcMock.state.fakeProvider = undefined
  wcMock.state.enableError = null
  wcMock.state.initError = null
  wcMock.state.accounts = ['0x1111111111111111111111111111111111111111']
  wcMock.state.enableWait = undefined
  wcMock.state.enableCalls = 0
})

describe('createWalletConnectController', () => {
  it('requires projectId before loading WalletConnect', async () => {
    await expect(
      createWalletConnectController({ projectId: '', metadata: METADATA }),
    ).rejects.toMatchObject({ code: 'walletconnect_project_id_missing' })
    expect(wcMock.state.initCalls).toBe(0)
  })

  it('exposes externally supplied wallets in the initial state', async () => {
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      wallets: WALLETS,
    })

    expect(controller.getState()).toEqual({ status: 'idle', wallets: WALLETS })
  })

  it('publishes connecting and uri_ready states with the externally selected wallet', async () => {
    let releaseEnable!: () => void
    wcMock.state.enableWait = new Promise((resolve) => {
      releaseEnable = resolve
    })
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
      wallets: WALLETS,
    })
    const states: WalletConnectControllerState[] = []
    const unsubscribe = controller.subscribe((state) => states.push(state))

    const connectPromise = controller.connect({ walletId: 'metamask' })
    await vi.waitFor(() => expect(wcMock.state.fakeProvider).toBeDefined())
    wcMock.state.fakeProvider?.emit('display_uri', 'wc:test-uri')
    releaseEnable()
    await connectPromise
    unsubscribe()

    expect(states).toEqual(
      expect.arrayContaining([
        { status: 'connecting', wallets: WALLETS, selectedWallet: WALLETS[0] },
        {
          status: 'uri_ready',
          wallets: WALLETS,
          selectedWallet: WALLETS[0],
          uri: 'wc:test-uri',
        },
        { status: 'connected', wallets: WALLETS, accounts: wcMock.state.accounts },
      ]),
    )
  })

  it('initializes WalletConnect with custom UI mode and derived EVM chains', async () => {
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base', 'arbitrum'],
      rpcMap: { 8453: 'https://custom-base-rpc' },
    })

    await controller.connect()

    expect(wcMock.state.initOpts).toMatchObject({
      projectId: 'pid',
      metadata: METADATA,
      showQrModal: false,
      customStoragePrefix: expect.stringMatching(/^stableops-walletconnect-/),
      optionalChains: [
        EvmWalletChainConfigs.base.eip155ChainId,
        EvmWalletChainConfigs.arbitrum.eip155ChainId,
      ],
    })
    expect(wcMock.state.initOpts?.rpcMap).toEqual({
      8453: 'https://custom-base-rpc',
      [EvmWalletChainConfigs.arbitrum.eip155ChainId]:
        EvmWalletChainConfigs.arbitrum.rpcUrls[0],
    })
  })

  it('fills providers after connect and supports sendOrderWalletPayment', async () => {
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })

    await controller.connect()

    expect(controller.providers.base).toBe(wcMock.state.fakeProvider)

    const sent = await sendOrderWalletPayment({
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
      providers: controller.providers,
    })

    expect(sent).toMatchObject({
      txHash: '0xTXHASH',
      chain: 'base',
      asset: 'USDC',
      fromAddress: '0x1111111111111111111111111111111111111111',
      toAddress: '0x2222222222222222222222222222222222222222',
      amountUnits: '10500000',
    })
    await sent.confirmation
  })

  it('coalesces repeated connect calls on the same controller', async () => {
    let releaseEnable!: () => void
    wcMock.state.enableWait = new Promise((resolve) => {
      releaseEnable = resolve
    })
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })

    const first = controller.connect({ walletId: 'metamask' })
    const second = controller.connect({ walletId: 'metamask' })
    releaseEnable()

    await expect(Promise.all([first, second])).resolves.toEqual([
      wcMock.state.accounts,
      wcMock.state.accounts,
    ])
    expect(wcMock.state.initCalls).toBe(1)
    expect(wcMock.state.enableCalls).toBe(1)
  })

  it('disconnects the WalletConnect provider and clears providers', async () => {
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })
    const states: WalletConnectControllerState[] = []
    controller.subscribe((state) => states.push(state))

    await controller.connect()
    const provider = wcMock.state.fakeProvider!
    await controller.disconnect()

    expect(provider.disconnected).toBe(true)
    expect(controller.providers.base).toBeUndefined()
    expect(states).toContainEqual({ status: 'disconnected', wallets: [] })
  })

  it('wraps connect errors and preserves the original cause', async () => {
    const userRejected = Object.assign(new Error('User rejected'), { code: 4001 })
    wcMock.state.enableError = userRejected
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
    })

    const err = await controller.connect().catch((error: unknown) => error)

    expect(err).toBeInstanceOf(StableOpsWalletError)
    expect(err).toMatchObject({ code: 'walletconnect_connect_failed' })
    expect((err as Error & { cause?: unknown }).cause).toBe(userRejected)
    expect((err as StableOpsWalletError).details).toEqual({ cause: userRejected })
    expect(controller.getState()).toMatchObject({
      status: 'failed',
      error: err,
      wallets: [],
    })
  })
})
