export type RpcActionName = "getContractState" | "getContractEvents" | "getTx" | "sendTx";

export type EventType = "Deposit" | "Claim";

export interface VaultState {
  roundId: number;
  potRaw: string;
  leader: string;
  deadline: number;
  lastDepositRaw?: string;
  tokenId?: string;
  durationSec?: number;
  minDepositRaw?: string;
  minRaiseBps?: number;
}

export interface VaultEvent {
  type: EventType;
  roundId: number;
  actor: string;
  amountRaw: string;
  potAfterRaw?: string;
  newDeadline?: number;
  txHash: string;
  timestamp?: number;
}

export interface RpcDebugEntry {
  id: number;
  time: string;
  action: string;
  method: string;
  status: "ok" | "error";
  params: unknown;
  result?: unknown;
  error?: string;
}

export interface WalletCapabilities {
  canConnect: boolean;
  canSignAndSendContractCall: boolean;
  canSendOp20: boolean;
}

export interface WalletDetectionResult {
  providerName: string;
  mode: "wallet" | "manual";
  reason?: string;
  capabilities: WalletCapabilities;
}

export interface ConnectedWallet {
  address: string;
  network: string;
}

