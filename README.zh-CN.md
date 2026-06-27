# StableOps Wallet SDK

StableOps 官方浏览器钱包支付辅助 SDK。

[View English README](./README.md)

StableOps Wallet SDK 用于浏览器侧从主流自托管钱包发起链上稳定币支付，并把资金转到 StableOps 返回的链上 `paymentInstructions`。StableOps 仍然负责 Payment Order 创建、幂等、地址分配、链上扫描、确认数推进和 Webhook 投递；这个钱包 SDK 只负责选择可支付的指令，并请求用户的钱包签名和广播转账。

这个 SDK 适合已经从可信后端拿到支付订单，并且需要在前端完成链上付款步骤的浏览器应用。

## 官方文档

完整接入指南、API Reference、钱包集成示例和支付流程说明，请查看官方文档：

- 中文文档：https://stableops.dev/zh/docs
- English docs：https://stableops.dev/en/docs

## 功能

- 面向浏览器的 StableOps 支付指令发送助手。
- 通过 EIP-1193 provider 支持 EVM 钱包。
- 通过 TronLink / TronWeb provider 支持 TRON 钱包。
- 通过 wallet adapter 支持 Solana 钱包。
- 可从浏览器当前可用的钱包中自动选择候选支付指令。
- 内置 ERC-20、TRC-20、SPL Token 的链上转账辅助逻辑。
- Public types 已内联，不依赖 StableOps 内部 workspace 包。
- 同时输出 CJS、ESM 和 TypeScript 类型声明。

## 环境要求

- 浏览器运行环境。
- 由后端创建好的 Payment Order。
- 浏览器注入的钱包 provider，或你主动传入的钱包 provider。

不要把 `STABLEOPS_API_KEY` 暴露到浏览器。Payment Order 必须在服务端创建，前端只接收订单 id、金额和 `paymentInstructions`。

## 安装

```bash
pnpm add @stableops/wallet-sdk
```

```bash
npm install @stableops/wallet-sdk
```

```bash
yarn add @stableops/wallet-sdk
```

## 快速开始

使用后端返回的订单，并让 SDK 从浏览器里自动选择兼容的钱包 provider：

```ts
import { getInjectedWalletProviders, sendOrderWalletPayment } from '@stableops/wallet-sdk'

const sent = await sendOrderWalletPayment({
  order,
  providers: getInjectedWalletProviders(),
})

console.log(sent.txHash)

// 可选：在后台监听链上 revert。
sent.confirmation.catch((err) => {
  // err.code === 'wallet_tx_reverted'
})
```

这是最高层的调用方式。它会从订单候选链列表里选择一条当前浏览器可支付的指令，并通过匹配的钱包发起链上转账。

## 手动选择支付链

如果你希望自己控制用户用哪条链支付，可以先选择指令和 provider，再调用底层发送方法：

```ts
import {
  getInjectedWalletProviders,
  selectWalletPaymentInstruction,
  sendWalletPayment,
} from '@stableops/wallet-sdk'

const { instruction, provider } = selectWalletPaymentInstruction(
  order.paymentInstructions,
  getInjectedWalletProviders(),
)

const sent = await sendWalletPayment({
  provider,
  amount: order.amount,
  instruction,
})

console.log(sent.txHash)

// 可选：在后台监听链上 revert。
sent.confirmation.catch((err) => {
  // err.code === 'wallet_tx_reverted'
})
```

## WalletConnect 自定义 UI

移动端浏览器或没有注入 EVM provider 的页面，可以创建 WalletConnect controller，
并由你的应用自己渲染钱包选择和二维码弹窗。SDK 不内置 UI，也不维护钱包列表；
钱包选项由外部传入，界面通过订阅 controller state 渲染。

使用这条路径的应用需要额外安装可选 WalletConnect 运行时：

```bash
npm install @walletconnect/universal-provider
```

```ts
import { createWalletConnectController, sendOrderWalletPayment } from '@stableops/wallet-sdk'

const walletConnect = await createWalletConnectController({
  projectId: 'YOUR_REOWN_PROJECT_ID',
  metadata: {
    name: 'Your App',
    description: 'StableOps checkout',
    url: window.location.origin,
    icons: [`${window.location.origin}/icon.png`],
  },
  chains: ['base', 'arbitrum'],
  solanaChains: ['solana', 'solana-devnet'],
  wallets: [
    {
      id: 'metamask',
      name: 'MetaMask',
      links: {
        native: 'metamask://',
        universal: 'https://metamask.app.link',
      },
    },
  ],
})

const unsubscribe = walletConnect.subscribe((state) => {
  // 在这里渲染自定义钱包列表、二维码、连接中或错误状态。
  // state.status === 'uri_ready' 时可读取 state.uri 生成二维码。
})

await walletConnect.connect({ walletId: 'metamask' })

const sent = await sendOrderWalletPayment({
  order,
  providers: walletConnect.providers,
})

unsubscribe()
console.log(sent.txHash)
```

EVM WalletConnect 行为保持兼容现有 EVM-only 用法。Solana WalletConnect
是否可用取决于具体钱包：自定义 RPC / devnet 流程需要钱包支持
`solana_signTransaction`，钱包自行广播流程需要支持
`solana_signAndSendTransaction`。TRON WalletConnect 付款暂未开启，需先验证目标钱包的
交易构造、签名和广播契约；TRON 请继续使用现有 TronLink / TronWeb 注入路径。

## 返回值

### `SentWalletPayment`

```ts
{
  txHash: string
  chain: string
  asset: string
  tokenContract: string
  amount: string
  amountUnits: string
  // 链上交易回执确认结果。resolve 表示交易已上链且合约执行成功（或超时 best-effort 放行），
  // reject（code: 'wallet_tx_reverted'）表示链上 revert，没有代币转出。
  // 不阻塞主支付流程返回。
  confirmation: Promise<void>
}
```

`confirmation` 是 **best-effort** 参考结果。它的设计目的是在交易发出后尽早捕获立即 revert（如余额不足），避免用户长时间等待后才发现失败。查询在后台进行，不延迟 `sendWalletPayment` 的返回。

**重要**：服务端链上扫描结果是权威状态。如果 scanner 已推进订单状态（`detected` / `confirmed` 等），始终以服务端为准，忽略 `confirmation` 的 reject。

## 支持的钱包流程

当前支持：

- EVM 网络：通过 EIP-1193 钱包，例如 MetaMask 及兼容 provider。
- TRON：通过 TronLink / TronWeb provider。
- Solana：通过支持 `signAndSendTransaction` 或 `signTransaction` 的 wallet adapter。

不同链的发送逻辑如下：

- EVM：必要时自动切链或加链，然后发送 ERC-20 `transfer`。
- TRON：构造、签名并广播 TRC-20 `transfer`。
- Solana：幂等创建 Associated Token Account，并发送 SPL Token `TransferChecked`。

## 支持的链和资产

当前 SDK 支持：

- 链：Ethereum、Base、Arbitrum、Polygon、TRON、Solana 以及支持的测试网。
- 资产：USDC 和 USDT。

最新支持范围和环境配置请参考官方文档：

- https://stableops.dev/zh/docs
- https://stableops.dev/en/docs

## 常见使用方式

- 后端使用 `@stableops/api-sdk` 创建 Payment Order。
- 前端只接收 `amount` 和 `paymentInstructions`。
- 前端使用浏览器钱包把资金打到订单专属收款地址。
- StableOps 负责后续链上确认和 Webhook 回调到你的服务端。

完整的端到端流程请参考官方 Quickstart 和 Wallet SDK 文档。

## License

本 SDK 使用 `Apache-2.0` 许可证。详见 [LICENSE](./LICENSE)。
