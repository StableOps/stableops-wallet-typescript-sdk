import { afterEach, describe, expect, it } from 'vitest'

import { cleanupStaleWalletConnectStorage } from './walletconnect-storage'

function createFakeLocalStorage(initial: Record<string, string>) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    get length() {
      return map.size
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  }
}

describe('cleanupStaleWalletConnectStorage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('清理旧前缀条目，保留当前前缀与无关条目', async () => {
    const fake = createFakeLocalStorage({
      'wc@2:core:0.3:stableops-walletconnect-1-1//keychain': 'stale',
      'wc@2:core:0.3:stableops-walletconnect-2-2//keychain': 'current',
      'unrelated-key': 'keep',
    })
    Object.defineProperty(globalThis, 'localStorage', {
      value: fake,
      configurable: true,
      writable: true,
    })

    await cleanupStaleWalletConnectStorage('stableops-walletconnect-2-2')

    expect([...fake.map.keys()]).toEqual([
      'wc@2:core:0.3:stableops-walletconnect-2-2//keychain',
      'unrelated-key',
    ])
  })

  it('无 localStorage / indexedDB 的环境下静默通过', async () => {
    await expect(
      cleanupStaleWalletConnectStorage('stableops-walletconnect-3-3'),
    ).resolves.toBeUndefined()
  })
})
