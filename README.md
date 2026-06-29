# StableOps Wallet SDK

[![npm version](https://img.shields.io/npm/v/@stableops/wallet-sdk)](https://www.npmjs.com/package/@stableops/wallet-sdk) [![npm downloads](https://img.shields.io/npm/dm/@stableops/wallet-sdk)](https://www.npmjs.com/package/@stableops/wallet-sdk) [![License](https://img.shields.io/npm/l/@stableops/wallet-sdk)](./LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org)

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
- TRON wallet support via TronLink / TronWeb providers, or via WalletConnect (`tronweb` required).
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

// Optional: listen for on-chain revert in the background.
sent.confirmation.catch((err) => {
  // err.code === 'wallet_tx_reverted'
})
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

console.log(sent.txHash)

// Optional: catch on-chain revert in the background.
sent.confirmation.catch((err) => {
  // err.code === 'wallet_tx_reverted'
})
```

## WalletConnect with Custom UI

For mobile browsers or pages without an injected EVM provider, create a
WalletConnect controller and render your own wallet picker and QR dialog.
The SDK does not ship UI and does not maintain a wallet list; pass your wallet
options in and subscribe to controller state.

Install the optional WalletConnect runtime in applications that use this path:

```bash
npm install @walletconnect/universal-provider
# TRON WalletConnect payments additionally need tronweb to build and broadcast transactions:
npm install tronweb
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
  tronChains: ['tron', 'tron-nile'],
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
  // Render your wallet picker, QR code, loading state, or error state here.
  // state.status === 'uri_ready' includes state.uri for QR rendering.
})

await walletConnect.connect({ walletId: 'metamask' })

const sent = await sendOrderWalletPayment({
  order,
  providers: walletConnect.providers,
})

unsubscribe()
console.log(sent.txHash)
```

EVM WalletConnect behavior remains compatible with existing EVM-only usage. Solana
WalletConnect support depends on the connected wallet supporting
`solana_signTransaction` for custom RPC/devnet flows or `solana_signAndSendTransaction`
for wallet-broadcast flows. TRON WalletConnect support requires the optional
`tronweb` dependency: the SDK builds the unsigned TRC-20 `transfer`, asks the wallet
to sign it via `tron_signTransaction`, and broadcasts the signed transaction itself.
Transactions are built/broadcast against a TRON full node — trongrid mainnet / Nile
by default, overridable per call with `sendWalletPayment({ ..., tronRpcUrl })`. The
existing TronLink/TronWeb injected provider path continues to work unchanged; the
two paths coexist and are selected automatically by provider type.

## Return Value

### `SentWalletPayment`

```ts
{
  txHash: string
  chain: string
  asset: string
  tokenContract: string
  amount: string
  amountUnits: string
  // Resolves when the transaction succeeds on chain (or times out best-effort).
  // Rejects with code 'wallet_tx_reverted' if the contract call reverted
  // (e.g. insufficient balance). Does NOT block the main payment flow.
  confirmation: Promise<void>
}
```

`confirmation` is a **best-effort** hint. It lets the UI catch immediate reverts
(such as an out-of-balance error) without waiting for the full server-side
detection cycle. It runs in the background and does not delay `sendWalletPayment`
from returning.

**Important**: Server-side chain scanning is the authoritative source of truth.
If the server has already advanced the payment order past `created`
(`detected`, `confirmed`, etc.), always defer to the server state and ignore
any `confirmation` rejection.

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
guidance.

## Common Usage Notes

- Create the payment order on your backend with `@stableops/api-sdk`.
- Pass only `amount` and `paymentInstructions` to the browser.
- Use the browser wallet to send the transfer to the order-specific address.
- Let StableOps confirm the transfer and dispatch webhook updates back to your server.

For a full end-to-end flow, see the official quickstart and wallet SDK docs.

## License

This SDK is licensed under `Apache-2.0`. See [LICENSE](./LICENSE).
