# Bitcoin Time Vault v1 (OP_NET Testnet)

Production-ready frontend dApp for OP_NET TESTNET using **PILL OP_20**.

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

## Run Locally

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import project in Vercel.
3. Set env vars in Vercel Project Settings:
   - `NEXT_PUBLIC_OPNET_RPC_URL`
   - `NEXT_PUBLIC_VAULT_ADDRESS`
   - optional explorer vars
4. Deploy.

## Manual Mode (OP_WALLET fallback)

If wallet/provider lacks required capabilities:

1. Use OP_WALLET UI to send PILL OP_20 manually:
   - Token ID: `opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle`
   - To: vault address
   - Amount: chosen PILL amount
2. Copy the transfer txid.
3. Paste txid into Step 2 in app.
4. Use manual call instructions shown in-app for `recordDeposit(...)` and `claim()` when in-app signing is unavailable.
5. Click refresh / keep auto-refresh enabled until state/events update.

## RPC Auto-Detect Strategy

`lib/opnetRpc.ts` contains a method resolver with candidate lists per action:

- `getContractStateCandidates`
- `getContractEventsCandidates`
- `getTxCandidates`
- `sendTxCandidates`

On first use:
- each candidate method is tried with test params
- first successful non-error JSON-RPC method is selected
- selected method is cached in `localStorage` (`btv1.rpc.resolved.*`)

If cached method later fails, resolver auto-falls back and re-resolves.

## 60-Second Demo Script

1. Connect wallet (or stay in Manual Mode).
2. Enter `10` PILL.
3. Step 1: send PILL to vault (in-app or manual).
4. Step 2: record deposit on contract.
5. Watch countdown at `60s`.
6. Make another deposit before expiry to reset timer.
7. Let timer reach `Expired - leader can claim`.
8. Current leader clicks Claim (or uses manual claim call instructions).

