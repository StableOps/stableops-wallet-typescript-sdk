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
- Mobile wallet support via WalletConnect v2 (deep links + QR fallback).
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

## Mobile / WalletConnect

Mobile browsers (Safari / Chrome on iOS or Android, outside an in-wallet
browser) do not expose `window.ethereum` and cannot be probed for installed
wallets. To support this flow, use the optional WalletConnect helper. It opens
the official WalletConnect modal that lists installed wallets, deep-links into
the chosen wallet app, and falls back to a QR code when no wallet is detected.

The helper covers EVM chains only. Desktop extensions and in-wallet browsers
continue to work through `getInjectedWalletProviders()` and do not require a
`projectId`.

```bash
npm install @walletconnect/ethereum-provider
```

```ts
import { createWalletConnectConnection, sendOrderWalletPayment } from '@stableops/wallet-sdk'

const wc = await createWalletConnectConnection({
  // Free account at https://cloud.reown.com
  projectId: 'YOUR_REOWN_PROJECT_ID',
  metadata: {
    name: 'My App',
    description: 'Pay with stablecoins',
    url: 'https://myapp.com',
    icons: ['https://myapp.com/icon.png'],
  },
})

// Triggers the WalletConnect modal: pick a wallet → deep link → sign → return.
await wc.connect()

const sent = await sendOrderWalletPayment({
  order,
  providers: wc.providers,
})

console.log(sent.txHash)
```

`createWalletConnectConnection` accepts an optional `chains` subset (defaults
to all EVM chains) and a `rpcMap` override keyed by EIP-155 chain id. Use
`wc.onDisplayUri(uri => ...)` if you want to render the QR yourself, and
`wc.disconnect()` to tear the session down.

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
