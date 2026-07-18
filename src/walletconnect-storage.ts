import { walletDebug } from './errors'

// 每个 WalletConnect controller 都用独立存储前缀（见 walletconnect.ts），旧前缀
// 遗留的会话数据不会再被读取。这里 best-effort 清理它们，防止 localStorage /
// IndexedDB 随访问次数无限累积。任何一步失败（隐私模式、WC 内部格式变化）都
// 静默放弃，不影响主流程。
export const WALLETCONNECT_STORAGE_PREFIX_MARKER = 'stableops-walletconnect-'

// @walletconnect/keyvaluestorage 浏览器端使用的 IndexedDB 库名 / 表名（其内部常量）。
const WALLETCONNECT_INDEXED_DB = 'WALLET_CONNECT_V2_INDEXED_DB'
const WALLETCONNECT_OBJECT_STORE = 'keyvaluepairs'

function isStaleKey(key: string, currentPrefix: string): boolean {
  return key.includes(WALLETCONNECT_STORAGE_PREFIX_MARKER) && !key.includes(currentPrefix)
}

export async function cleanupStaleWalletConnectStorage(currentPrefix: string): Promise<void> {
  cleanupLocalStorage(currentPrefix)
  await cleanupIndexedDb(currentPrefix)
}

function cleanupLocalStorage(currentPrefix: string): void {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    if (!storage) return
    const stale: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key && isStaleKey(key, currentPrefix)) stale.push(key)
    }
    for (const key of stale) storage.removeItem(key)
    if (stale.length > 0) {
      walletDebug('walletconnect:storage-cleanup', { localStorageKeys: stale.length })
    }
  } catch {
    // 访问 localStorage 本身可能抛错（隐私模式），放弃即可。
  }
}

async function cleanupIndexedDb(currentPrefix: string): Promise<void> {
  try {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) return
    // 支持 databases() 的浏览器先确认库存在，避免 open 顺手创建空库。
    if (typeof idb.databases === 'function') {
      const databases = await idb.databases()
      if (!databases.some((info) => info.name === WALLETCONNECT_INDEXED_DB)) return
    }
    const db = await new Promise<IDBDatabase | undefined>((resolve) => {
      const request = idb.open(WALLETCONNECT_INDEXED_DB)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(undefined)
      request.onblocked = () => resolve(undefined)
    })
    if (!db) return
    try {
      if (!db.objectStoreNames.contains(WALLETCONNECT_OBJECT_STORE)) return
      const stale = await new Promise<string[]>((resolve) => {
        const transaction = db.transaction(WALLETCONNECT_OBJECT_STORE, 'readonly')
        const request = transaction.objectStore(WALLETCONNECT_OBJECT_STORE).getAllKeys()
        request.onsuccess = () =>
          resolve(
            request.result.filter(
              (key): key is string => typeof key === 'string' && isStaleKey(key, currentPrefix),
            ),
          )
        request.onerror = () => resolve([])
      })
      if (stale.length === 0) return
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(WALLETCONNECT_OBJECT_STORE, 'readwrite')
        const store = transaction.objectStore(WALLETCONNECT_OBJECT_STORE)
        for (const key of stale) store.delete(key)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => resolve()
        transaction.onabort = () => resolve()
      })
      walletDebug('walletconnect:storage-cleanup', { indexedDbKeys: stale.length })
    } finally {
      db.close()
    }
  } catch {
    // best-effort：IndexedDB 不可用或 WC 内部格式变化时放弃清理。
  }
}
