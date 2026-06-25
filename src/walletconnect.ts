import { EVM_WALLET_CHAINS, EvmWalletChainConfigs } from './chains'
import { StableOpsWalletError } from './errors'
import type {
  Eip1193Provider,
  EvmWalletChainId,
  WalletProvider,
  WalletProviderByChain,
} from './types'

type WalletConnectModule = typeof import('@walletconnect/ethereum-provider')

let walletConnectModulePromise: Promise<WalletConnectModule> | undefined

async function loadWalletConnect(): Promise<WalletConnectModule> {
  if (!walletConnectModulePromise) {
    walletConnectModulePromise = import('@walletconnect/ethereum-provider').catch((err) => {
      walletConnectModulePromise = undefined
      const wrapped = new StableOpsWalletError(
        'WalletConnect connections require the optional dependency @walletconnect/ethereum-provider; please install it: npm install @walletconnect/ethereum-provider',
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

type WalletConnectProviderLike = Eip1193Provider & {
  enable(): Promise<string[]>
  disconnect(): Promise<void>
  on(event: 'display_uri', cb: (uri: string) => void): unknown
  removeListener?: (event: 'display_uri', cb: (uri: string) => void) => unknown
}

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
  const chains = input.chains ?? [...EVM_WALLET_CHAINS]
  const optionalChains = chains.map((chain) => EvmWalletChainConfigs[chain].eip155ChainId)
  const rpcMap = buildRpcMap(chains, input.rpcMap)
  const providers: WalletProviderByChain = {}
  const listeners = new Set<(state: WalletConnectControllerState) => void>()
  let state: WalletConnectControllerState = { status: 'idle', wallets }
  let providerPromise: Promise<WalletConnectProviderLike> | undefined
  let displayUriListener: ((uri: string) => void) | undefined
  // 单飞 connect：同一个 controller 上并发 / 重复点击只跑一次 enable，避免在 WC SDK
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
    for (const chain of chains) delete providers[chain]
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
          return (await mod.EthereumProvider.init({
            projectId: input.projectId,
            metadata: input.metadata,
            optionalChains: optionalChains as [number, ...number[]],
            rpcMap,
            showQrModal: false,
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
      const provider = await getProvider()
      return provider.request<T>(args)
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
          const accounts = await provider.enable()
          for (const chain of chains) providers[chain] = provider as unknown as WalletProvider
          setState({ status: 'connected', wallets, accounts })
          return accounts
        } catch (err) {
          const error = wrapWalletConnectError(
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
