import type { Eip1193Provider } from './types'

export type UniversalProviderLike = {
  request<T = unknown>(
    args: {
      method: string
      params?: unknown[] | Record<string, unknown>
    },
    chainId?: string,
  ): Promise<T>
}

export function createEvmProviderFromUniversal(
  provider: UniversalProviderLike,
  chainId: string,
): Eip1193Provider {
  return {
    request(args) {
      return provider.request(args, chainId)
    },
  }
}
