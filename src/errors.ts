export class StableOpsWalletError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'StableOpsWalletError'
  }
}

// ── Debug ──────────────────────────────────────────────────────────────────
// 模块级 debug 开关：默认关，关闭时所有 walletDebug() 调用是零开销 no-op。
// 开启方式（任一）：
//   1) setWalletSdkDebug(true)（代码里显式打开/关闭）
//   2) 全局 globalThis.STABLEOPS_WALLET_DEBUG = true（浏览器控制台即可临时打开）
//   3) 环境变量 WALLET_SDK_DEBUG=1 / true（Node / 打包注入）
// 优先级：setWalletSdkDebug 一旦被显式调用即以它为准，否则回落到全局/环境兜底。
let moduleDebug: boolean | undefined

export function setWalletSdkDebug(enabled: boolean): void {
  moduleDebug = enabled
}

export function isWalletSdkDebugEnabled(): boolean {
  if (typeof moduleDebug === 'boolean') return moduleDebug
  const scope = globalThis as {
    STABLEOPS_WALLET_DEBUG?: unknown
    process?: { env?: Record<string, string | undefined> }
  }
  const flag = scope.STABLEOPS_WALLET_DEBUG
  if (flag === true || flag === 'true' || flag === '1') return true
  const env = scope.process?.env?.WALLET_SDK_DEBUG
  return env === '1' || env === 'true'
}

// 统一日志出口：带 [wallet-sdk] 前缀，浏览器与 Node 控制台均可读；关闭时直接返回不计算参数开销。
export function walletDebug(event: string, data?: Record<string, unknown>): void {
  if (!isWalletSdkDebugEnabled()) return
  if (data !== undefined) {
    console.log(`[wallet-sdk] ${event}`, data)
  } else {
    console.log(`[wallet-sdk] ${event}`)
  }
}
