"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ActionsCard } from "@/components/ActionsCard";
import { EventFeed } from "@/components/EventFeed";
import { HeaderBar } from "@/components/HeaderBar";
import { RpcDebugPanel } from "@/components/RpcDebugPanel";
import { VaultStatusCard } from "@/components/VaultStatusCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PILL_TOKEN_ID, loadPublicConfig } from "@/lib/config";
import { toDeadlineLabel } from "@/lib/format";
import { OpnetRpcClient } from "@/lib/opnetRpc";
import type { RpcDebugEntry, VaultState } from "@/lib/types";
import { parseDepositAmountToRaw } from "@/lib/validation";
import { VaultClient } from "@/lib/vaultClient";
import { WalletAdapter, detectWallet } from "@/lib/walletDetect";

function isLikelyTestnet(network: string) {
  const normalized = network.toLowerCase();
  return (
    normalized.includes("testnet") ||
    normalized.includes("opnet_testnet") ||
    normalized.includes("opnet testnet") ||
    normalized.includes("signet") ||
    normalized.includes("regtest")
  );
}

export default function HomePage() {
  const config = loadPublicConfig();

  const [wallet, setWallet] = useState<WalletAdapter | null>(null);
  const [connectedAddress, setConnectedAddress] = useState<string>("");
  const [connectedNetwork, setConnectedNetwork] = useState<string>("");
  const [nowSec, setNowSec] = useState(Math.floor(Date.now() / 1000));
  const [amountInput, setAmountInput] = useState("10");
  const [transferTxidInput, setTransferTxidInput] = useState("");
  const [autoRefreshEvents, setAutoRefreshEvents] = useState(true);
  const [rpcDebugEntries, setRpcDebugEntries] = useState<RpcDebugEntry[]>([]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  const [lastStep1TxHash, setLastStep1TxHash] = useState("");
  const [lastStep2TxHash, setLastStep2TxHash] = useState("");
  const [lastClaimTxHash, setLastClaimTxHash] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setWallet(detectWallet());
  }, []);

  const walletDetection =
    wallet?.detection ??
    ({
      providerName: "No provider detected",
      mode: "manual",
      reason: "Detecting wallet provider...",
      capabilities: {
        canConnect: false,
        canSendOp20: false,
        canSignAndSendContractCall: false
      }
    } as const);

  const rpcClient = useMemo(() => {
    if (!config.ok) return null;
    return new OpnetRpcClient({
      rpcUrl: config.data.NEXT_PUBLIC_OPNET_RPC_URL,
      onDebug: (entry) => {
        setRpcDebugEntries((prev) => [...prev.slice(-149), entry]);
      }
    });
  }, [config]);

  const vaultClient = useMemo(() => {
    if (!config.ok || !rpcClient) return null;
    return new VaultClient(rpcClient, config.data.NEXT_PUBLIC_VAULT_ADDRESS);
  }, [config, rpcClient]);

  const stateQuery = useQuery({
    queryKey: ["vault-state", config.ok ? config.data.NEXT_PUBLIC_VAULT_ADDRESS : "missing"],
    queryFn: async () => {
      if (!vaultClient) throw new Error("Vault client is not initialized");
      return vaultClient.getState();
    },
    enabled: !!vaultClient,
    refetchInterval: (query) => {
      const data = query.state.data as VaultState | undefined;
      if (!data?.deadline) return 5000;
      const countdown = toDeadlineLabel(data.deadline, Math.floor(Date.now() / 1000));
      return countdown.expired ? 5000 : 1000;
    }
  });

  const eventsQuery = useQuery({
    queryKey: ["vault-events", config.ok ? config.data.NEXT_PUBLIC_VAULT_ADDRESS : "missing", autoRefreshEvents],
    queryFn: async () => {
      if (!vaultClient) throw new Error("Vault client is not initialized");
      return vaultClient.getEvents(40);
    },
    enabled: !!vaultClient,
    refetchInterval: autoRefreshEvents ? 5000 : false
  });

  const fullWalletCapabilities =
    walletDetection.capabilities.canConnect &&
    walletDetection.capabilities.canSendOp20 &&
    walletDetection.capabilities.canSignAndSendContractCall;
  const connectionMode = walletDetection.mode === "wallet" && fullWalletCapabilities ? "wallet" : "manual";
  const connectionState = connectedAddress ? "connected" : connectionMode === "wallet" ? "ready" : "manual";

  async function handleConnect() {
    if (!wallet) {
      toast.error("Wallet provider is still being detected. Retry in a moment.");
      return;
    }
    if (walletDetection.mode !== "wallet") {
      toast.error(walletDetection.reason ?? "Automatic mode requires OP_WALLET / OP_NET provider.");
      return;
    }

    if (!walletDetection.capabilities.canConnect) {
      toast.error("This provider cannot connect accounts for automatic mode.");
      return;
    }

    setIsConnecting(true);
    try {
      const connected = await wallet.connect();
      setConnectedAddress(connected.address);
      setConnectedNetwork(connected.network);
      if (!isLikelyTestnet(connected.network)) {
        toast.error(`Wrong network detected: ${connected.network}. Please switch to OP_NET Testnet.`);
      } else {
        toast.success("Wallet connected");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleStep1Send() {
    let parsed: { whole: string; raw: string };
    try {
      parsed = parseDepositAmountToRaw(amountInput);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid amount");
      return;
    }

    if (connectionMode !== "wallet") {
      toast.error("Automatic mode is required. Enable OP_WALLET with full capabilities.");
      return;
    }

    if (!connectedAddress) {
      toast.error("Connect wallet first.");
      return;
    }
    if (!wallet) {
      toast.error("Wallet provider unavailable. Refresh and reconnect.");
      return;
    }

    setIsSending(true);
    const pendingToast = toast.loading("Sending PILL transfer...");
    try {
      const txHash = await wallet.sendOp20({
        tokenId: PILL_TOKEN_ID,
        to: config.ok ? config.data.NEXT_PUBLIC_VAULT_ADDRESS : "",
        amountRaw: parsed.raw
      });
      setLastStep1TxHash(txHash);
      setTransferTxidInput(txHash);
      toast.success("Step 1 complete: PILL transfer sent.", { id: pendingToast });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send PILL", { id: pendingToast });
    } finally {
      setIsSending(false);
    }
  }

  async function handleStep2RecordDeposit() {
    if (!vaultClient) return;
    if (!transferTxidInput.trim()) {
      toast.error("Paste transfer txid first.");
      return;
    }
    let parsed: { whole: string; raw: string };
    try {
      parsed = parseDepositAmountToRaw(amountInput);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid amount");
      return;
    }

    if (!connectedAddress && connectionMode === "wallet") {
      toast.error("Connect wallet first.");
      return;
    }

    if (connectionMode !== "wallet") {
      toast.error("Automatic mode is required. Enable OP_WALLET with full capabilities.");
      return;
    }

    if (!walletDetection.capabilities.canSignAndSendContractCall) {
      toast.error("Wallet cannot call contract in-app.");
      return;
    }
    if (!wallet) {
      toast.error("Wallet provider unavailable. Refresh and reconnect.");
      return;
    }

    setIsRecording(true);
    const pendingToast = toast.loading("Recording deposit on vault...");
    try {
      const txHash = await vaultClient.recordDeposit({
        wallet,
        amountRaw: parsed.raw,
        depositor: connectedAddress,
        txid: transferTxidInput.trim()
      });
      setLastStep2TxHash(txHash);
      toast.success("Step 2 complete: recordDeposit submitted.", { id: pendingToast });
      await Promise.all([stateQuery.refetch(), eventsQuery.refetch()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "recordDeposit failed", { id: pendingToast });
    } finally {
      setIsRecording(false);
    }
  }

  async function handleClaim() {
    if (!vaultClient) return;
    if (!connectedAddress) {
      toast.error("Connect wallet first.");
      return;
    }

    if (connectionMode !== "wallet") {
      toast.error("Automatic mode is required. Enable OP_WALLET with full capabilities.");
      return;
    }

    if (!walletDetection.capabilities.canSignAndSendContractCall) {
      toast.error("Wallet cannot call contract in-app.");
      return;
    }
    if (!wallet) {
      toast.error("Wallet provider unavailable. Refresh and reconnect.");
      return;
    }

    setIsClaiming(true);
    const pendingToast = toast.loading("Submitting claim...");
    try {
      const txHash = await vaultClient.claim(wallet);
      setLastClaimTxHash(txHash);
      toast.success("Claim transaction submitted.", { id: pendingToast });
      await Promise.all([stateQuery.refetch(), eventsQuery.refetch()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Claim failed", { id: pendingToast });
    } finally {
      setIsClaiming(false);
    }
  }

  if (!config.ok) {
    return (
      <main className="container py-10">
        <Card className="mx-auto max-w-3xl border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Missing Required Environment Variables
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="rounded-md border bg-muted/40 p-4 text-sm">{config.error}</pre>
            <p className="text-sm text-muted-foreground">
              Set <code>NEXT_PUBLIC_OPNET_RPC_URL</code> and <code>NEXT_PUBLIC_VAULT_ADDRESS</code> then restart.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const state = stateQuery.data;
  const wrongNetwork = connectedNetwork && !isLikelyTestnet(connectedNetwork);

  return (
    <main className="container space-y-6 py-8">
      <HeaderBar
        vaultAddress={config.data.NEXT_PUBLIC_VAULT_ADDRESS}
        tokenId={PILL_TOKEN_ID}
        walletAddress={connectedAddress}
        connectionState={connectionState}
      />

      {connectionMode !== "wallet" ? (
        <Alert variant="destructive">
          <AlertTitle>Automatic Wallet Mode Required</AlertTitle>
          <AlertDescription>
            {walletDetection.reason ??
              "Enable OP_WALLET / OP_NET provider with connect + OP_20 send + contract-call support."}
          </AlertDescription>
        </Alert>
      ) : null}

      {wrongNetwork ? (
        <Alert variant="destructive">
          <AlertTitle>Wrong Network</AlertTitle>
          <AlertDescription>
            Connected network is <strong>{connectedNetwork}</strong>. Switch to OP_NET Testnet.
          </AlertDescription>
        </Alert>
      ) : null}

      {stateQuery.error ? (
        <Alert variant="destructive">
          <AlertTitle>RPC Error</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{stateQuery.error instanceof Error ? stateQuery.error.message : "Failed to fetch state."}</p>
            <Button variant="outline" size="sm" onClick={() => stateQuery.refetch()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <VaultStatusCard state={state} nowSec={nowSec} />
          <EventFeed
            events={eventsQuery.data ?? []}
            autoRefresh={autoRefreshEvents}
            onAutoRefreshChange={setAutoRefreshEvents}
            onRefresh={() => eventsQuery.refetch()}
            isRefreshing={eventsQuery.isFetching}
            explorerTxBase={config.data.NEXT_PUBLIC_EXPLORER_TX}
            nowSec={nowSec}
          />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <ActionsCard
            vaultAddress={config.data.NEXT_PUBLIC_VAULT_ADDRESS}
            tokenId={PILL_TOKEN_ID}
            state={state}
            connectedAddress={connectedAddress}
            walletMode={connectionMode}
            capabilities={walletDetection.capabilities}
            amountInput={amountInput}
            setAmountInput={setAmountInput}
            transferTxidInput={transferTxidInput}
            setTransferTxidInput={setTransferTxidInput}
            onConnect={handleConnect}
            onStep1Send={handleStep1Send}
            onStep2Record={handleStep2RecordDeposit}
            onClaim={handleClaim}
            isConnecting={isConnecting}
            isSending={isSending}
            isRecording={isRecording}
            isClaiming={isClaiming}
            nowSec={nowSec}
            lastStep1TxHash={lastStep1TxHash}
            lastStep2TxHash={lastStep2TxHash}
            lastClaimTxHash={lastClaimTxHash}
          />
          <RpcDebugPanel entries={rpcDebugEntries} />
        </div>
      </div>
    </main>
  );
}
