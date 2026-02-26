import { useMemo } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rawToPill, toDeadlineLabel } from "@/lib/format";
import type { VaultState, WalletCapabilities } from "@/lib/types";
import { parseDepositAmountToRaw } from "@/lib/validation";

interface ActionsCardProps {
  vaultAddress: string;
  tokenId: string;
  state?: VaultState;
  connectedAddress?: string;
  walletMode: "wallet" | "manual";
  capabilities: WalletCapabilities;
  amountInput: string;
  setAmountInput: (value: string) => void;
  transferTxidInput: string;
  setTransferTxidInput: (value: string) => void;
  onConnect: () => void;
  onStep1Send: () => void;
  onStep2Record: () => void;
  onClaim: () => void;
  isConnecting: boolean;
  isSending: boolean;
  isRecording: boolean;
  isClaiming: boolean;
  nowSec: number;
  lastStep1TxHash?: string;
  lastStep2TxHash?: string;
  lastClaimTxHash?: string;
}

const quickPills = ["10", "25", "50", "100"];

export function ActionsCard(props: ActionsCardProps) {
  const {
    vaultAddress,
    tokenId,
    state,
    connectedAddress,
    walletMode,
    capabilities,
    amountInput,
    setAmountInput,
    transferTxidInput,
    setTransferTxidInput,
    onConnect,
    onStep1Send,
    onStep2Record,
    onClaim,
    isConnecting,
    isSending,
    isRecording,
    isClaiming,
    nowSec,
    lastStep1TxHash,
    lastStep2TxHash,
    lastClaimTxHash
  } = props;

  const parsedAmount = useMemo(() => {
    try {
      return parseDepositAmountToRaw(amountInput);
    } catch {
      return null;
    }
  }, [amountInput]);

  const countdown = toDeadlineLabel(state?.deadline ?? 0, nowSec);
  const isLeader = !!connectedAddress && !!state?.leader && connectedAddress === state.leader;
  const canClaimNow = countdown.expired && isLeader;

  const step1Reason = !parsedAmount
    ? "Amount must be a whole number > 0"
    : !connectedAddress
      ? "Connect wallet first."
      : !capabilities.canSendOp20
        ? "Wallet does not support OP_20 transfer in-app."
        : "";

  const step2Reason = !transferTxidInput.trim()
    ? "Paste transfer txid first."
    : !connectedAddress
      ? "Connect wallet first."
      : !capabilities.canSignAndSendContractCall
        ? "Wallet does not support in-app contract calls."
        : "";

  const claimReason = !connectedAddress
    ? "Connect wallet first."
    : !countdown.expired
      ? "Timer still running."
      : !isLeader
        ? "Only leader can claim."
        : !capabilities.canSignAndSendContractCall
          ? "Wallet does not support in-app contract calls."
          : "";

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onConnect} disabled={isConnecting}>
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {connectedAddress ? "Reconnect Wallet" : "Connect Wallet"}
          </Button>
          <Badge variant={walletMode === "wallet" ? "default" : "destructive"}>
            {walletMode === "wallet" ? "Wallet Mode" : "Wallet Required"}
          </Badge>
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="space-y-2">
            <Label htmlFor="deposit-amount">Deposit Amount (PILL)</Label>
            <Input
              id="deposit-amount"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              inputMode="numeric"
              placeholder="10"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {quickPills.map((pill) => (
              <Button key={pill} type="button" variant="outline" size="sm" onClick={() => setAmountInput(pill)}>
                {pill}
              </Button>
            ))}
          </div>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Raw units: {parsedAmount?.raw ?? "invalid"} {parsedAmount ? `(${rawToPill(parsedAmount.raw)} PILL)` : ""}
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Badge variant="outline">Step 1</Badge>
            <span>Send PILL to vault</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="text-muted-foreground">To:</span>
            <span className="font-mono">{vaultAddress}</span>
            <CopyButton value={vaultAddress} ariaLabel="Copy vault address" />
          </div>

          <Button
            onClick={onStep1Send}
            disabled={!!step1Reason || isSending}
            className="w-full justify-between"
          >
            <span>Send PILL In-App</span>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
          {step1Reason ? <p className="text-xs text-muted-foreground">{step1Reason}</p> : null}

          {lastStep1TxHash ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              Last Step1 tx: <span className="font-mono">{lastStep1TxHash}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Badge variant="outline">Step 2</Badge>
            <span>Record deposit on vault</span>
          </div>

          <Input
            placeholder="Paste transfer txid"
            value={transferTxidInput}
            onChange={(event) => setTransferTxidInput(event.target.value)}
          />

          <Button
            onClick={onStep2Record}
            disabled={!!step2Reason || isRecording}
            className="w-full justify-between"
          >
            <span>Record Deposit</span>
            {isRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </Button>
          {step2Reason ? <p className="text-xs text-muted-foreground">{step2Reason}</p> : null}

          {lastStep2TxHash ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              Last recordDeposit tx: <span className="font-mono">{lastStep2TxHash}</span>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Badge variant="destructive">Claim</Badge>
            <span>Leader claims full pot</span>
          </div>
          <Button onClick={onClaim} disabled={!!claimReason || isClaiming} className="w-full">
            {isClaiming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Claim Pot
          </Button>
          {claimReason ? <p className="text-xs text-muted-foreground">{claimReason}</p> : null}
          {lastClaimTxHash ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
              Last claim tx: <span className="font-mono">{lastClaimTxHash}</span>
            </div>
          ) : null}
          {canClaimNow ? (
            <p className="text-xs text-emerald-600">Claim available now.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
