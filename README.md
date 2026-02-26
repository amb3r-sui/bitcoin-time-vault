# Bitcoin Time Vault v1 (OP_NET)

Production frontend dApp for OP_NET Testnet using the PILL OP_20 token.

## What It Does

- Runs a 60-second last-depositor game ("Time Vault")
- Uses real OP_NET Testnet RPC calls (no mock chain data)
- Uses push deposit model:
  - Step 1: user sends PILL to vault address
  - Step 2: user records deposit on vault contract
- Lets only the current leader claim the full pot after expiry
- Shows live countdown, pot, leader, and event feed

## Architecture (Transparency)

### Frontend

- `app/page.tsx`: page state, polling, actions flow
- `components/HeaderBar.tsx`: top network, token, wallet, and address info
- `components/VaultStatusCard.tsx`: pot, leader, round, countdown
- `components/ActionsCard.tsx`: connect, deposit stepper, claim
- `components/EventFeed.tsx`: recent events with tx hash copy/link
- `components/RpcDebugPanel.tsx`: resolver/method debug logs

### Chain integration

- `lib/opnetRpc.ts`:
  - JSON-RPC client with method resolver
  - auto-detects working RPC method names from candidate lists
  - caches resolved methods in `localStorage`
- `lib/vaultClient.ts`:
  - reads vault state and events
  - normalizes variant event/state shapes
  - supports both `recordDeposit(txid)` and `recordDeposit(amount,depositor,txid)`
- `lib/walletDetect.ts`:
  - auto-detects wallet providers (`opwallet`, `opnet`, `bitcoin`, `unisat`, `ethereum`)
  - probes capabilities and enables Manual Mode fallback

## Current Status

- Next.js 14 + TypeScript app router frontend implemented
- Tailwind + shadcn/ui components wired
- TanStack Query polling implemented
- zod validation for deposit input and txid
- Real RPC integration with method auto-detection and fallback
- Wallet capability probing with Manual Mode flow

## Repository Structure

- `/app` - app router pages and providers
- `/components` - UI and feature components
- `/lib` - config, formatting, validation, RPC, wallet, vault clients
- `/types` - global window provider typings
- `/README.md` - project docs
- `/LICENSE` - MIT license

## Required Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_OPNET_RPC_URL=https://your-opnet-testnet-rpc
NEXT_PUBLIC_VAULT_ADDRESS=your_vault_contract_address
NEXT_PUBLIC_EXPLORER_TX=https://your-explorer/tx
NEXT_PUBLIC_EXPLORER_ADDR=https://your-explorer/address
```

Required:

- `NEXT_PUBLIC_OPNET_RPC_URL`
- `NEXT_PUBLIC_VAULT_ADDRESS`

Optional:

- `NEXT_PUBLIC_EXPLORER_TX`
- `NEXT_PUBLIC_EXPLORER_ADDR`

## How To Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy To Vercel

1. Push this repo to GitHub.
2. Import the repository in Vercel.
3. Add environment variables in Vercel Project Settings.
4. Deploy.

## Manual Mode (OP_WALLET fallback)

If wallet/provider cannot sign one or more calls:

1. Send PILL manually in OP_WALLET:
   - Token ID: `opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle`
   - To: vault address
   - Amount: chosen PILL amount
2. Copy the transfer txid.
3. Paste txid into Step 2 in the app.
4. Use in-app call instructions for `recordDeposit(...)` or `claim()` if needed.
5. Refresh/poll until state and event feed update.

## RPC Auto-Detect Details

The method resolver in `lib/opnetRpc.ts` tries candidates until one succeeds:

- `getContractStateCandidates`
- `getContractEventsCandidates`
- `getTxCandidates`
- `sendTxCandidates`

After first success, method names are cached in localStorage:

- `btv1.rpc.resolved.getContractState`
- `btv1.rpc.resolved.getContractEvents`
- `btv1.rpc.resolved.getTx`
- `btv1.rpc.resolved.sendTx`

If a cached method fails later, the resolver retries candidate discovery.

## 60-Second Demo Script

1. Connect wallet (or stay in Manual Mode).
2. Enter `10` PILL.
3. Step 1: send PILL to vault.
4. Step 2: record deposit on contract.
5. Show countdown reset to 60 seconds.
6. Make another deposit before expiry to reset timer.
7. Wait for `Expired - leader can claim`.
8. Leader claims the full pot.
