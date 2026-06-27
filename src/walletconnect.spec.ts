import { beforeEach, describe, expect, it, vi } from 'vitest'

const wcMock = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  type FakeProvider = {
    calls: Array<{
      args: { method: string; params?: unknown[] | Record<string, unknown> }
      chainId?: string
    }>
    connectOpts?: Record<string, unknown>
    listeners: Map<string, Set<Listener>>
    disconnected: boolean
    session?: {
      namespaces?: Record<string, { accounts?: string[]; chains?: string[] }>
    }
    request: (
      args: {
        method: string
        params?: unknown[] | Record<string, unknown>
      },
      chainId?: string,
    ) => Promise<unknown>
    connect: (opts: Record<string, unknown>) => Promise<unknown>
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
    connectWait: undefined as Promise<void> | undefined,
    connectCalls: 0,
    sessionChains: undefined as string[] | undefined,
    sessionNamespaces: undefined as Record<string, { accounts?: string[]; chains?: string[] }> | undefined,
  }

  const makeFakeProvider = (): FakeProvider => {
    const listeners = new Map<string, Set<Listener>>()
    const provider: FakeProvider = {
      calls: [],
      listeners,
      disconnected: false,
      async request(args, chainId) {
        provider.calls.push({ args, chainId })
        if (args.method === 'eth_requestAccounts') return state.accounts
        if (args.method === 'wallet_switchEthereumChain') return null
        if (args.method === 'eth_sendTransaction') return '0xTXHASH'
        if (args.method === 'eth_getTransactionReceipt') return { status: '0x1' }
        return null
      },
      async connect(opts) {
        state.connectCalls++
        provider.connectOpts = opts
        if (state.enableError) throw state.enableError
        await state.connectWait
        if (state.sessionNamespaces) {
          provider.session = { namespaces: state.sessionNamespaces }
        } else if (state.sessionChains) {
          provider.session = {
            namespaces: {
              eip155: {
                chains: state.sessionChains,
                accounts: state.sessionChains.map(
                  (chain) => `${chain}:0x1111111111111111111111111111111111111111`,
                ),
              },
            },
          }
        } else {
          provider.session = {
            namespaces: {
              eip155: {
                chains: ['eip155:8453'],
                accounts: ['eip155:8453:0x1111111111111111111111111111111111111111'],
              },
            },
          }
        }
        return provider.session
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

vi.mock('@walletconnect/universal-provider', () => ({
  default: {
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
  wcMock.state.connectWait = undefined
  wcMock.state.connectCalls = 0
  wcMock.state.sessionChains = undefined
  wcMock.state.sessionNamespaces = undefined
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
    let releaseConnect!: () => void
    wcMock.state.connectWait = new Promise((resolve) => {
      releaseConnect = resolve
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
    releaseConnect()
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
        {
          status: 'connected',
          wallets: WALLETS,
          accounts: ['eip155:8453:0x1111111111111111111111111111111111111111'],
        },
      ]),
    )
  })

  it('connects WalletConnect with custom UI mode and derived EVM namespaces', async () => {
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
      customStoragePrefix: expect.stringMatching(/^stableops-walletconnect-/),
    })
    expect(wcMock.state.initOpts).not.toHaveProperty('chains')
    expect(wcMock.state.initOpts).not.toHaveProperty('optionalChains')
    expect(wcMock.state.fakeProvider?.connectOpts).toMatchObject({
      optionalNamespaces: {
        eip155: {
          chains: ['eip155:8453', 'eip155:42161'],
          methods: expect.arrayContaining(['eth_sendTransaction', 'wallet_switchEthereumChain']),
          events: expect.arrayContaining(['chainChanged', 'accountsChanged']),
          rpcMap: {
            8453: 'https://custom-base-rpc',
            [EvmWalletChainConfigs.arbitrum.eip155ChainId]:
              EvmWalletChainConfigs.arbitrum.rpcUrls[0],
          },
        },
      },
    })
  })

  it('omits disabled WalletConnect namespaces and rejects empty authorization', async () => {
    wcMock.state.sessionNamespaces = {}
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: [],
      solanaChains: ['solana-devnet'],
    })

    await expect(controller.connect()).rejects.toMatchObject({
      code: 'walletconnect_no_authorized_chains',
    })
    expect(wcMock.state.fakeProvider?.connectOpts).toMatchObject({
      optionalNamespaces: {
        solana: {
          chains: ['solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'],
          methods: expect.arrayContaining(['solana_signTransaction']),
          events: expect.arrayContaining(['accountsChanged']),
        },
      },
    })
    const optionalNamespaces = wcMock.state.fakeProvider?.connectOpts
      ?.optionalNamespaces as Record<string, unknown>
    expect(optionalNamespaces.eip155).toBeUndefined()
    expect(optionalNamespaces.tron).toBeUndefined()
    expect(controller.providers.solana).toBeUndefined()
  })

  it('fills providers after connect and supports sendOrderWalletPayment', async () => {
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })

    await controller.connect()

    expect(controller.providers.base).toBeDefined()

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

  it('only exposes WalletConnect providers for session-authorized chains', async () => {
    wcMock.state.sessionChains = [`eip155:${EvmWalletChainConfigs.base.eip155ChainId}`]
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base', 'ethereum-sepolia'],
    })

    await controller.connect()

    expect(controller.providers.base).toBeDefined()
    expect(controller.providers['ethereum-sepolia']).toBeUndefined()
  })

  it('exposes Solana WalletConnect providers for authorized session accounts', async () => {
    wcMock.state.sessionNamespaces = {
      solana: {
        accounts: [
          'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:So11111111111111111111111111111111111111112',
        ],
      },
    }
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: [],
      solanaChains: ['solana-devnet'],
    })

    await controller.connect()

    expect(controller.providers['solana-devnet']).toMatchObject({
      publicKey: 'So11111111111111111111111111111111111111112',
    })
    expect(controller.providers.solana).toBeUndefined()
  })

  it('does not expose TRON WalletConnect as a payment provider without verified support', async () => {
    wcMock.state.sessionNamespaces = {
      tron: {
        accounts: ['tron:0xcd8690dc:TQjcL8mfCfAqLQzXWw5nP9jJmkJ3uH5r6R'],
      },
    }
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: [],
      tronChains: ['tron-nile'],
    })

    await controller.connect()

    expect(controller.providers['tron-nile']).toBeUndefined()
  })

  it('coalesces repeated connect calls on the same controller', async () => {
    let releaseConnect!: () => void
    wcMock.state.connectWait = new Promise((resolve) => {
      releaseConnect = resolve
    })
    const controller = await createWalletConnectController({
      projectId: 'pid',
      metadata: METADATA,
      chains: ['base'],
    })

    const first = controller.connect({ walletId: 'metamask' })
    const second = controller.connect({ walletId: 'metamask' })
    releaseConnect()

    await expect(Promise.all([first, second])).resolves.toEqual([
      ['eip155:8453:0x1111111111111111111111111111111111111111'],
      ['eip155:8453:0x1111111111111111111111111111111111111111'],
    ])
    expect(wcMock.state.initCalls).toBe(1)
    expect(wcMock.state.connectCalls).toBe(1)
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
