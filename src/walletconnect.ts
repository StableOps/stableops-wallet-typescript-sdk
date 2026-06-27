import {
  EVM_WALLET_CHAINS,
  EvmWalletChainConfigs,
  WALLETCONNECT_ACCOUNT_EVENTS,
  WALLETCONNECT_EVM_METHODS,
  WALLETCONNECT_SOLANA_METHODS,
  WALLETCONNECT_TRON_METHODS,
} from './chains'
import { StableOpsWalletError } from './errors'
import {
  createEvmProviderFromUniversal,
  createSolanaProviderFromUniversal,
  type UniversalProviderLike,
} from './walletconnect-adapters'
import {
  getAuthorizedWalletChains,
  parseWalletConnectAccount,
  toWalletConnectChainId,
  type WalletConnectSessionNamespaces,
} from './walletconnect-caip'
import type {
  ChainId,
  Eip1193Provider,
  EvmWalletChainId,
  WalletProvider,
  WalletProviderByChain,
} from './types'

type WalletConnectModule = typeof import('@walletconnect/universal-provider')

let walletConnectModulePromise: Promise<WalletConnectModule> | undefined
let walletConnectControllerSequence = 0

async function loadWalletConnect(): Promise<WalletConnectModule> {
  if (!walletConnectModulePromise) {
    walletConnectModulePromise = import('@walletconnect/universal-provider').catch((err) => {
      walletConnectModulePromise = undefined
      const wrapped = new StableOpsWalletError(
        'WalletConnect connections require the optional dependency @walletconnect/universal-provider; please install it: npm install @walletconnect/universal-provider',
        'walletconnect_dependency_missing',
        { cause: err },
      )
      ;(wrapped as Error & { cause?: unknown }).cause = err
      throw wrapped
    })
  }
  return walletConnectModulePromise
}

export type WalletConnectMetadata = {
  name: string
  description: string
  url: string
  icons: string[]
}

export type WalletConnectWalletOption = {
  id: string
  name: string
  iconUrl?: string
  links?: {
    native?: string
    universal?: string
  }
}

export type CreateWalletConnectControllerInput = {
  projectId: string
  metadata: WalletConnectMetadata
  chains?: EvmWalletChainId[]
  rpcMap?: Partial<Record<number, string>>
  solanaChains?: Array<'solana' | 'solana-devnet'>
  tronChains?: Array<'tron' | 'tron-nile'>
  wallets?: WalletConnectWalletOption[]
}

export type WalletConnectControllerState =
  | { status: 'idle'; wallets: WalletConnectWalletOption[] }
  | {
      status: 'connecting'
      wallets: WalletConnectWalletOption[]
      selectedWallet?: WalletConnectWalletOption
    }
  | {
      status: 'uri_ready'
      wallets: WalletConnectWalletOption[]
      uri: string
      selectedWallet?: WalletConnectWalletOption
    }
  | { status: 'connected'; wallets: WalletConnectWalletOption[]; accounts: string[] }
  | { status: 'failed'; wallets: WalletConnectWalletOption[]; error: StableOpsWalletError }
  | { status: 'disconnected'; wallets: WalletConnectWalletOption[] }

export type WalletConnectController = {
  provider: Eip1193Provider
  providers: WalletProviderByChain
  getState(): WalletConnectControllerState
  subscribe(listener: (state: WalletConnectControllerState) => void): () => void
  connect(input?: { walletId?: string }): Promise<string[]>
  disconnect(): Promise<void>
}

type WalletConnectProviderLike = UniversalProviderLike & {
  connect(input: { optionalNamespaces: WalletConnectOptionalNamespaces }): Promise<unknown>
  disconnect(): Promise<void>
  session?: {
    namespaces?: WalletConnectSessionNamespaces
  }
  on(event: 'display_uri', cb: (uri: string) => void): unknown
  removeListener?: (event: 'display_uri', cb: (uri: string) => void) => unknown
}

type WalletConnectOptionalNamespace = {
  chains: string[]
  methods: readonly string[]
  events: readonly string[]
  rpcMap?: Record<number, string>
}

type WalletConnectOptionalNamespaces = Record<string, WalletConnectOptionalNamespace>

function wrapWalletConnectError(message: string, code: string, cause: unknown): StableOpsWalletError {
  const wrapped = new StableOpsWalletError(message, code, { cause })
  ;(wrapped as Error & { cause?: unknown }).cause = cause
  return wrapped
}

function buildRpcMap(
  chains: readonly EvmWalletChainId[],
  overrides: Partial<Record<number, string>> | undefined,
): Record<number, string> {
  const rpcMap: Record<number, string> = {}
  for (const chain of chains) {
    const config = EvmWalletChainConfigs[chain]
    const rpc = config.rpcUrls[0]
    if (rpc) rpcMap[config.eip155ChainId] = rpc
  }
  for (const [chainId, rpc] of Object.entries(overrides ?? {})) {
    if (typeof rpc === 'string') rpcMap[Number(chainId)] = rpc
  }
  return rpcMap
}

function buildOptionalNamespaces(input: {
  evmChains: readonly EvmWalletChainId[]
  solanaChains: ReadonlyArray<'solana' | 'solana-devnet'>
  tronChains: ReadonlyArray<'tron' | 'tron-nile'>
  rpcMap: Record<number, string>
}): WalletConnectOptionalNamespaces {
  const optionalNamespaces: WalletConnectOptionalNamespaces = {}
  if (input.evmChains.length > 0) {
    optionalNamespaces.eip155 = {
      chains: input.evmChains.map(toWalletConnectChainId),
      methods: WALLETCONNECT_EVM_METHODS,
      events: WALLETCONNECT_ACCOUNT_EVENTS,
      rpcMap: input.rpcMap,
    }
  }
  if (input.solanaChains.length > 0) {
    optionalNamespaces.solana = {
      chains: input.solanaChains.map(toWalletConnectChainId),
      methods: WALLETCONNECT_SOLANA_METHODS,
      events: WALLETCONNECT_ACCOUNT_EVENTS,
    }
  }
  if (input.tronChains.length > 0) {
    optionalNamespaces.tron = {
      chains: input.tronChains.map(toWalletConnectChainId),
      methods: WALLETCONNECT_TRON_METHODS,
      events: WALLETCONNECT_ACCOUNT_EVENTS,
    }
  }
  return optionalNamespaces
}

function getSessionAccounts(provider: WalletConnectProviderLike): string[] {
  return Object.values(provider.session?.namespaces ?? {}).flatMap(
    (namespace) => namespace.accounts ?? [],
  )
}

function getSessionAccountForChain(
  namespaces: WalletConnectSessionNamespaces | undefined,
  chain: ChainId,
): string | undefined {
  const caip2 = toWalletConnectChainId(chain)
  for (const namespace of Object.values(namespaces ?? {})) {
    for (const account of namespace.accounts ?? []) {
      const parsed = parseWalletConnectAccount(account)
      if (parsed?.chainId === caip2) return parsed.accountAddress
    }
  }
  return undefined
}

export async function createWalletConnectController(
  input: CreateWalletConnectControllerInput,
): Promise<WalletConnectController> {
  if (!input.projectId) {
    throw new StableOpsWalletError(
      'WalletConnect projectId is required; obtain one from https://cloud.reown.com',
      'walletconnect_project_id_missing',
    )
  }

  const wallets = input.wallets ?? []
  const evmChains = input.chains ?? [...EVM_WALLET_CHAINS]
  const solanaChains = input.solanaChains ?? []
  const tronChains = input.tronChains ?? []
  const requestedChains: ChainId[] = [...evmChains, ...solanaChains, ...tronChains]
  const defaultEvmChain = evmChains[0]
  const rpcMap = buildRpcMap(evmChains, input.rpcMap)
  const optionalNamespaces = buildOptionalNamespaces({
    evmChains,
    solanaChains,
    tronChains,
    rpcMap,
  })
  const storagePrefix = `stableops-walletconnect-${Date.now()}-${++walletConnectControllerSequence}`
  const providers: WalletProviderByChain = {}
  const listeners = new Set<(state: WalletConnectControllerState) => void>()
  let state: WalletConnectControllerState = { status: 'idle', wallets }
  let providerPromise: Promise<WalletConnectProviderLike> | undefined
  let displayUriListener: ((uri: string) => void) | undefined
  // 单飞 connect：同一个 controller 上并发 / 重复点击只跑一次 connect，避免在 WC SDK
  // 内部产生重复的 proposal/session 导致 "No matching key" 噪音日志。
  let connectInflight: Promise<string[]> | undefined

  function setState(next: WalletConnectControllerState): void {
    state = next
    for (const listener of listeners) listener(next)
  }

  function getSelectedWallet(walletId: string | undefined): WalletConnectWalletOption | undefined {
    if (!walletId) return undefined
    return wallets.find((wallet) => wallet.id === walletId)
  }

  function clearProviders(): void {
    for (const chain of requestedChains) delete providers[chain]
  }

  function fillAuthorizedProviders(provider: WalletConnectProviderLike): void {
    clearProviders()
    const namespaces = provider.session?.namespaces
    const authorized = namespaces ? getAuthorizedWalletChains(namespaces) : undefined
    for (const chain of evmChains) {
      if (!authorized || authorized.has(chain)) {
        providers[chain] = createEvmProviderFromUniversal(
          provider,
          toWalletConnectChainId(chain),
        ) as WalletProvider
      }
    }
    for (const chain of solanaChains) {
      if (!authorized || authorized.has(chain)) {
        const account = getSessionAccountForChain(namespaces, chain)
        if (account) {
          providers[chain] = createSolanaProviderFromUniversal(
            provider,
            toWalletConnectChainId(chain),
            account,
          ) as WalletProvider
        }
      }
    }
  }

  function assertHasAuthorizedChain(provider: WalletConnectProviderLike): void {
    const namespaces = provider.session?.namespaces
    if (!namespaces) return
    const authorized = getAuthorizedWalletChains(namespaces)
    const hasRequestedAuthorization = requestedChains.some((chain) => authorized.has(chain))
    if (!hasRequestedAuthorization) {
      throw new StableOpsWalletError(
        'WalletConnect wallet did not authorize any requested chain',
        'walletconnect_no_authorized_chains',
      )
    }
  }

  function attachDisplayUriListener(
    provider: WalletConnectProviderLike,
    selectedWallet: WalletConnectWalletOption | undefined,
  ): void {
    if (displayUriListener) provider.removeListener?.('display_uri', displayUriListener)
    displayUriListener = (uri: string) => {
      setState({ status: 'uri_ready', wallets, selectedWallet, uri })
    }
    provider.on('display_uri', displayUriListener)
  }

  function getProvider(): Promise<WalletConnectProviderLike> {
    if (!providerPromise) {
      providerPromise = (async () => {
        const mod = await loadWalletConnect()
        try {
          return (await mod.default.init({
            projectId: input.projectId,
            metadata: input.metadata,
            customStoragePrefix: storagePrefix,
          })) as unknown as WalletConnectProviderLike
        } catch (err) {
          providerPromise = undefined
          throw wrapWalletConnectError(
            'WalletConnect initialization failed',
            'walletconnect_init_failed',
            err,
          )
        }
      })()
    }
    return providerPromise
  }

  const proxyProvider: Eip1193Provider = {
    async request<T = unknown>(args: {
      method: string
      params?: unknown[] | Record<string, unknown>
    }): Promise<T> {
      if (!defaultEvmChain) {
        throw new StableOpsWalletError(
          'WalletConnect controller does not have a default EVM provider',
          'wallet_provider_mismatch',
        )
      }
      const provider = await getProvider()
      return createEvmProviderFromUniversal(provider, toWalletConnectChainId(defaultEvmChain)).request<T>(
        args,
      )
    },
  }

  return {
    provider: proxyProvider,
    providers,
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    async connect(connectInput) {
      if (state.status === 'connected') return state.accounts
      if (connectInflight) return connectInflight
      const selectedWallet = getSelectedWallet(connectInput?.walletId)
      setState({ status: 'connecting', wallets, selectedWallet })
      connectInflight = (async () => {
        let provider: WalletConnectProviderLike
        try {
          provider = await getProvider()
        } catch (err) {
          const error =
            err instanceof StableOpsWalletError
              ? err
              : wrapWalletConnectError(
                  'WalletConnect initialization failed',
                  'walletconnect_init_failed',
                  err,
                )
          setState({ status: 'failed', wallets, error })
          throw error
        }
        attachDisplayUriListener(provider, selectedWallet)
        try {
          await provider.connect({ optionalNamespaces })
          assertHasAuthorizedChain(provider)
          fillAuthorizedProviders(provider)
          const accounts = getSessionAccounts(provider)
          setState({ status: 'connected', wallets, accounts })
          return accounts
        } catch (err) {
          const error =
            err instanceof StableOpsWalletError
              ? err
              : wrapWalletConnectError(
                  'WalletConnect connection failed',
                  'walletconnect_connect_failed',
                  err,
                )
          setState({ status: 'failed', wallets, error })
          throw error
        }
      })()
      try {
        return await connectInflight
      } finally {
        connectInflight = undefined
      }
    },
    async disconnect() {
      if (!providerPromise) {
        clearProviders()
        setState({ status: 'disconnected', wallets })
        return
      }
      try {
        const provider = await providerPromise
        if (displayUriListener) {
          provider.removeListener?.('display_uri', displayUriListener)
          displayUriListener = undefined
        }
        await provider.disconnect()
      } finally {
        providerPromise = undefined
        connectInflight = undefined
        clearProviders()
        setState({ status: 'disconnected', wallets })
      }
    },
  }
}
