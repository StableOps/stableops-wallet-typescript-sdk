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
import {
  getInjectedWalletProviders,
  sendOrderWalletPayment,
} from '@stableops/wallet-sdk'

const sent = await sendOrderWalletPayment({
  order,
  providers: getInjectedWalletProviders(),
})

console.log(sent.txHash)
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

console.log(sent)
```

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
