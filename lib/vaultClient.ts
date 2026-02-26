import {
  OpnetRpcClient,
  getContractEventsCandidates,
  getContractStateCandidates,
  getTxCandidates
} from "@/lib/opnetRpc";
import type { VaultEvent, VaultState } from "@/lib/types";
import type { WalletAdapter } from "@/lib/walletDetect";

function toBigintString(value: unknown, fallback = "0") {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return BigInt(Math.trunc(value)).toString();
  if (typeof value === "string") return value;
  return fallback;
}

function toNumber(value: unknown, fallback = 0) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function toString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return fallback;
}

function unwrapResultObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    const nested =
      object.state ??
      object.result ??
      object.data ??
      object.vault ??
      object.contractState ??
      object.getState;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
    return object;
  }
  return {};
}

function pickKey(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}

function normalizeEvent(eventRaw: Record<string, unknown>): VaultEvent | null {
  const args =
    (eventRaw.args as Record<string, unknown>) ??
    (eventRaw.data as Record<string, unknown>) ??
    eventRaw;
  const typeRaw =
    toString(eventRaw.type) ||
    toString(eventRaw.event) ||
    toString(eventRaw.name) ||
    toString(args.type) ||
    toString(args.event);

  const normalizedType = typeRaw.toLowerCase();
  const isDeposit = normalizedType.includes("deposit");
  const isClaim = normalizedType.includes("claim");

  if (!isDeposit && !isClaim) return null;

  const actor = isDeposit
    ? toString(args.player ?? args.depositor ?? args.actor ?? args.who)
    : toString(args.winner ?? args.player ?? args.actor ?? args.who);

  const txHash = toString(
    eventRaw.txHash ??
      eventRaw.transactionHash ??
      eventRaw.hash ??
      args.txHash ??
      args.transactionHash ??
      args.hash
  );

  if (!txHash) return null;

  return {
    type: isDeposit ? "Deposit" : "Claim",
    roundId: toNumber(args.roundId ?? args.round ?? eventRaw.roundId ?? eventRaw.round, 0),
    actor,
    amountRaw: toBigintString(args.amount ?? args.pot ?? eventRaw.amount),
    potAfterRaw: isDeposit
      ? toBigintString(args.potAfter ?? args.pot_after ?? args.potAfterRaw ?? args.pot)
      : toBigintString(args.potAfter ?? args.pot),
    newDeadline: isDeposit ? toNumber(args.deadline ?? args.newDeadline ?? args.expiresAt, 0) : undefined,
    txHash,
    timestamp: toNumber(eventRaw.timestamp ?? args.timestamp ?? eventRaw.time, 0) || undefined
  };
}

export class VaultClient {
  private readonly rpc: OpnetRpcClient;
  private readonly vaultAddress: string;

  constructor(rpc: OpnetRpcClient, vaultAddress: string) {
    this.rpc = rpc;
    this.vaultAddress = vaultAddress;
  }

  private async callStateWithVariants() {
    const variants = [
      {
        address: this.vaultAddress,
        method: "getState",
        args: []
      },
      {
        contractAddress: this.vaultAddress,
        methodName: "getState",
        args: []
      },
      {
        to: this.vaultAddress,
        function: "getState",
        params: []
      },
      {
        address: this.vaultAddress
      }
    ];

    const errors: string[] = [];
    for (const params of variants) {
      try {
        return await this.rpc.callWithResolver(
          "getContractState",
          getContractStateCandidates,
          params,
          params
        );
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown getState error");
      }
    }
    throw new Error(`Failed to load vault state.\n${errors.join("\n")}`);
  }

  async getState(): Promise<VaultState> {
    const raw = await this.callStateWithVariants();
    const object = unwrapResultObject(raw);

    return {
      roundId: toNumber(pickKey(object, ["roundId", "round", "id"]), 0),
      potRaw: toBigintString(pickKey(object, ["pot", "potRaw", "balance", "totalPot"]), "0"),
      leader: toString(pickKey(object, ["leader", "currentLeader", "winner"]), ""),
      deadline: toNumber(pickKey(object, ["deadline", "roundDeadline", "expiresAt"]), 0),
      lastDepositRaw: toBigintString(
        pickKey(object, ["lastDeposit", "lastDepositRaw", "latestDeposit", "lastAmount"]),
        "0"
      ),
      tokenId: toString(pickKey(object, ["tokenId", "op20TokenId"]), ""),
      durationSec: toNumber(pickKey(object, ["durationSec", "duration", "roundDuration"]), 60),
      minDepositRaw: toBigintString(pickKey(object, ["minDeposit", "minDepositRaw"]), "0"),
      minRaiseBps: toNumber(pickKey(object, ["minRaiseBps", "minRaise"]), 0)
    };
  }

  async getEvents(limit = 30): Promise<VaultEvent[]> {
    const paramVariants = [
      {
        address: this.vaultAddress,
        limit
      },
      {
        contractAddress: this.vaultAddress,
        limit
      },
      {
        address: this.vaultAddress,
        fromBlock: "latest",
        limit
      }
    ];

    const errors: string[] = [];
    for (const params of paramVariants) {
      try {
        const raw = await this.rpc.callWithResolver(
          "getContractEvents",
          getContractEventsCandidates,
          params,
          params
        );

        const listCandidate =
          (raw as { events?: unknown[] })?.events ??
          (raw as { result?: unknown[] })?.result ??
          (raw as { data?: unknown[] })?.data ??
          raw;

        if (!Array.isArray(listCandidate)) {
          return [];
        }

        return listCandidate
          .map((event) => (event && typeof event === "object" ? normalizeEvent(event as Record<string, unknown>) : null))
          .filter((event): event is VaultEvent => event !== null)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown event loading error");
      }
    }

    throw new Error(`Failed to load events.\n${errors.join("\n")}`);
  }

  async getTransaction(txHash: string) {
    const paramVariants = [
      { txHash },
      { hash: txHash },
      { id: txHash },
      [txHash]
    ];

    const errors: string[] = [];
    for (const params of paramVariants) {
      try {
        return await this.rpc.callWithResolver("getTx", getTxCandidates, params, params);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown tx lookup error");
      }
    }

    throw new Error(`Unable to query transaction ${txHash}.\n${errors.join("\n")}`);
  }

  async recordDeposit(args: {
    wallet: WalletAdapter;
    amountRaw: string;
    depositor: string;
    txid: string;
  }) {
    const variants: Array<{ method: string; callArgs: unknown[] }> = [
      {
        method: "recordDeposit",
        callArgs: [args.txid]
      },
      {
        method: "recordDeposit",
        callArgs: [args.amountRaw, args.depositor, args.txid]
      }
    ];

    const errors: string[] = [];
    for (const variant of variants) {
      try {
        return await args.wallet.callContract({
          contract: this.vaultAddress,
          method: variant.method,
          callArgs: variant.callArgs
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown recordDeposit error");
      }
    }
    throw new Error(`Failed to call recordDeposit via wallet.\n${errors.join("\n")}`);
  }

  async claim(wallet: WalletAdapter) {
    const variants: Array<{ method: string; callArgs: unknown[] }> = [
      { method: "claim", callArgs: [] },
      { method: "claimPot", callArgs: [] }
    ];

    const errors: string[] = [];
    for (const variant of variants) {
      try {
        return await wallet.callContract({
          contract: this.vaultAddress,
          method: variant.method,
          callArgs: variant.callArgs
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Unknown claim error");
      }
    }
    throw new Error(`Failed to call claim via wallet.\n${errors.join("\n")}`);
  }
}

