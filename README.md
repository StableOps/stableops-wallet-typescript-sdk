# StableOps Wallet SDK

Official TypeScript wallet helper for StableOps checkout flows.

[中文文档](./README.zh-CN.md)

StableOps Wallet SDK helps browser applications send on-chain stablecoin
payments from mainstream self-custody wallets to the chain-specific payment
instructions returned by StableOps. StableOps still owns payment order
creation, idempotency, address allocation, chain scanning, confirmation
tracking, and webhook delivery. The wallet helper is responsible only for
selecting a payable instruction and asking the user's wallet to sign and
broadcast the transfer.

This SDK is intended for browser applications that already receive a payment
order from a trusted backend and need to complete the on-chain payment step.

## Documentation

For complete guides, API references, wallet integration examples, and payment
flow details, see the official documentation:

- English docs: https://stableops.dev/en/docs
- Chinese docs: https://stableops.dev/zh/docs

## Features

- Browser-first helper for StableOps payment instructions.
- EVM wallet support via EIP-1193 providers.
- TRON wallet support via TronLink / TronWeb providers.
- Solana wallet support via wallet adapters.
- Automatic candidate selection from available injected wallets.
- Chain-specific token transfer helpers for ERC-20, TRC-20, and SPL tokens.
- Self-contained public types with no StableOps workspace dependencies.
- Dual CJS and ESM builds with generated TypeScript declarations.

## Requirements

- A browser environment.
- A payment order created by your backend.
- An injected or supplied wallet provider.

Do not expose `STABLEOPS_API_KEY` in the browser. Create payment orders on your
server and send only the order id, amount, and `paymentInstructions` to the
frontend.

## Installation

```bash
pnpm add @stableops/wallet-sdk
```

```bash
npm install @stableops/wallet-sdk
```

```bash
yarn add @stableops/wallet-sdk
```

## Quick Start

Use the order returned by your backend and let the SDK choose a compatible
wallet provider from the browser.

```ts
import { getInjectedWalletProviders, sendOrderWalletPayment } from '@stableops/wallet-sdk'

const sent = await sendOrderWalletPayment({
  order,
  providers: getInjectedWalletProviders(),
})

console.log(sent.txHash)
```

This is the highest-level path. It selects a payable instruction from the
order's candidate list and sends the on-chain transfer through the first
matching provider.

## Manual Selection

If you want to control which chain the user pays on, select the instruction and
provider yourself, then call the lower-level sender.

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

## Supported Wallet Flows

The SDK currently supports:

- EVM networks through EIP-1193 wallets such as MetaMask and compatible providers.
- TRON through TronLink / TronWeb providers.
- Solana through wallet adapters that support `signAndSendTransaction` or `signTransaction`.

The transfer flow is chain-aware:

- EVM: switches or adds the network when needed, then sends an ERC-20 `transfer`.
- TRON: builds, signs, and broadcasts a TRC-20 `transfer`.
- Solana: creates the associated token account idempotently and sends an SPL Token `TransferChecked`.

## Supported Chains and Assets

This SDK supports:

- Chains: Ethereum, Base, Arbitrum, Polygon, TRON, Solana, and supported testnets.
- Assets: USDC and USDT.

See the official docs for the latest supported chains, assets, and environment
guidance:

- https://stableops.dev/en/docs
- https://stableops.dev/zh/docs

## Common Usage Notes

- Create the payment order on your backend with `@stableops/api-sdk`.
- Pass only `amount` and `paymentInstructions` to the browser.
- Use the browser wallet to send the transfer to the order-specific address.
- Let StableOps confirm the transfer and dispatch webhook updates back to your server.

For a full end-to-end flow, see the official quickstart and wallet SDK docs.

## License

This SDK is licensed under `Apache-2.0`. See [LICENSE](./LICENSE).
