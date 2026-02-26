import type { ConnectedWallet, WalletCapabilities, WalletDetectionResult } from "@/lib/types";

type UnknownProvider = {
  [key: string]: unknown;
  request?: (input: { method: string; params?: unknown }) => Promise<unknown>;
};

interface ProviderCandidate {
  providerName: string;
  provider: UnknownProvider;
}

function maybeString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function extractAddress(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && typeof (first as { address?: unknown }).address === "string") {
      return (first as { address: string }).address;
    }
  }
  if (value && typeof value === "object") {
    const cast = value as Record<string, unknown>;
    if (typeof cast.address === "string") return cast.address;
    if (typeof cast.account === "string") return cast.account;
    if (typeof cast.result === "string") return cast.result;
    if (Array.isArray(cast.accounts) && typeof cast.accounts[0] === "string") return cast.accounts[0];
  }
  return null;
}

function extractTxHash(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const cast = value as Record<string, unknown>;
    const candidate =
      cast.txHash ??
      cast.hash ??
      cast.transactionHash ??
      cast.transactionId ??
      cast.id ??
      cast.result;
    if (typeof candidate === "string") return candidate;
  }
  return null;
}

function getCandidateProviders(): ProviderCandidate[] {
  if (typeof window === "undefined") return [];
  const list: ProviderCandidate[] = [];

  const push = (name: string, provider: unknown) => {
    if (!provider || typeof provider !== "object") return;
    if (list.some((existing) => existing.provider === provider)) return;
    list.push({
      providerName: name,
      provider: provider as UnknownProvider
    });
  };

  push("OP_WALLET (window.opwallet)", window.opwallet);
  push("OP_NET (window.opnet)", window.opnet);
  push("Bitcoin Provider (window.bitcoin)", window.bitcoin);
  push("UniSat (window.unisat)", (window as Window & { unisat?: unknown }).unisat);
  push("Ethereum Provider (window.ethereum)", window.ethereum);

  return list;
}

function hasAnyMethod(provider: UnknownProvider, names: string[]) {
  return names.some((name) => typeof provider[name] === "function");
}

function hasRequest(provider: UnknownProvider) {
  return typeof provider.request === "function";
}

function detectCapabilities(provider: UnknownProvider): WalletCapabilities {
  const canConnect =
    hasAnyMethod(provider, ["connect", "requestAccounts", "accounts", "getAccounts"]) || hasRequest(provider);

  const canSignAndSendContractCall =
    hasAnyMethod(provider, [
      "signAndSendContractCall",
      "callContract",
      "sendContractCall",
      "invokeContract"
    ]) || hasRequest(provider);

  const canSendOp20 =
    hasAnyMethod(provider, [
      "signAndSendOP20Transfer",
      "sendOp20",
      "transferOP20",
      "op20Transfer"
    ]) || hasRequest(provider);

  return {
    canConnect,
    canSignAndSendContractCall,
    canSendOp20
  };
}

async function safeRequest(provider: UnknownProvider, method: string, params?: unknown) {
  if (!provider.request) throw new Error("request() not supported");
  return provider.request({ method, params });
}

async function tryDirectOrRequest(
  provider: UnknownProvider,
  directName: string,
  requestMethod: string,
  params: unknown
) {
  if (typeof provider[directName] === "function") {
    const fn = provider[directName] as (...args: unknown[]) => Promise<unknown>;
    if (Array.isArray(params)) {
      return fn(...params);
    }
    return fn(params);
  }
  return safeRequest(provider, requestMethod, params);
}

async function getNetwork(provider: UnknownProvider): Promise<string> {
  const directCandidates = ["getNetwork", "network", "chain"];

  for (const key of directCandidates) {
    const value = provider[key];
    if (typeof value === "function") {
      try {
        const network = await (value as () => Promise<unknown>)();
        const text = maybeString(network);
        if (text) return text;
      } catch {
        // continue
      }
    } else {
      const text = maybeString(value);
      if (text) return text;
    }
  }

  const requestCandidates = ["getNetwork", "opnet_getNetwork", "opnet_getChain", "eth_chainId"];
  for (const method of requestCandidates) {
    try {
      const result = await safeRequest(provider, method, {});
      const text = maybeString(result) ?? maybeString((result as { network?: string })?.network);
      if (text) return text;
    } catch {
      // continue
    }
  }

  return "unknown";
}

export class WalletAdapter {
  readonly detection: WalletDetectionResult;
  private readonly provider: UnknownProvider | null;
  private connectedAddress: string | null = null;
  private connectedNetwork: string | null = null;

  constructor(detection: WalletDetectionResult, provider: UnknownProvider | null) {
    this.detection = detection;
    this.provider = provider;
  }

  getAddress() {
    return this.connectedAddress;
  }

  getNetwork() {
    return this.connectedNetwork ?? "unknown";
  }

  private ensureProvider() {
    if (!this.provider) {
      throw new Error("Wallet provider not available in Manual Mode.");
    }
    return this.provider;
  }

  async connect(): Promise<ConnectedWallet> {
    const provider = this.ensureProvider();
    const attempts: Array<() => Promise<unknown>> = [];

    if (typeof provider.connect === "function") {
      attempts.push(() => (provider.connect as () => Promise<unknown>)());
    }
    if (typeof provider.requestAccounts === "function") {
      attempts.push(() => (provider.requestAccounts as () => Promise<unknown>)());
    }
    if (typeof provider.accounts === "function") {
      attempts.push(() => (provider.accounts as () => Promise<unknown>)());
    }
    if (typeof provider.getAccounts === "function") {
      attempts.push(() => (provider.getAccounts as () => Promise<unknown>)());
    }
    if (provider.request) {
      const methods = ["connect", "requestAccounts", "accounts", "getAccounts", "eth_requestAccounts"];
      for (const method of methods) {
        attempts.push(() => safeRequest(provider, method, {}));
      }
    }

    for (const attempt of attempts) {
      try {
        const result = await attempt();
        const address = extractAddress(result);
        if (!address) continue;

        const network = await getNetwork(provider);
        this.connectedAddress = address;
        this.connectedNetwork = network;
        return { address, network };
      } catch {
        // try next method
      }
    }

    throw new Error("Unable to connect wallet with detected provider methods.");
  }

  async sendOp20(args: { tokenId: string; to: string; amountRaw: string }) {
    const provider = this.ensureProvider();
    const attemptDirect = async (name: string) => {
      if (typeof provider[name] !== "function") return null;
      const fn = provider[name] as (...params: unknown[]) => Promise<unknown>;
      const result = await fn(args.tokenId, args.to, args.amountRaw);
      return extractTxHash(result);
    };

    const attemptRequest = async (method: string, params: unknown) => {
      if (!provider.request) return null;
      const result = await safeRequest(provider, method, params);
      return extractTxHash(result);
    };

    const directMethods = ["signAndSendOP20Transfer", "sendOp20", "transferOP20", "op20Transfer"];
    for (const method of directMethods) {
      try {
        const tx = await attemptDirect(method);
        if (tx) return tx;
      } catch {
        // continue
      }
    }

    const requestVariants: Array<{ method: string; params: unknown }> = [
      {
        method: "signAndSendOP20Transfer",
        params: {
          tokenId: args.tokenId,
          to: args.to,
          amountRaw: args.amountRaw
        }
      },
      {
        method: "sendOp20",
        params: {
          tokenId: args.tokenId,
          to: args.to,
          amountRaw: args.amountRaw
        }
      },
      {
        method: "transferOP20",
        params: {
          tokenId: args.tokenId,
          to: args.to,
          amountRaw: args.amountRaw
        }
      },
      {
        method: "op20_transfer",
        params: {
          tokenId: args.tokenId,
          to: args.to,
          amount: args.amountRaw
        }
      }
    ];

    for (const item of requestVariants) {
      try {
        const tx = await attemptRequest(item.method, item.params);
        if (tx) return tx;
      } catch {
        // continue
      }
    }

    throw new Error("Provider cannot send OP_20 transfer in-app. Use Manual Mode.");
  }

  async callContract(args: { contract: string; method: string; callArgs: unknown[] }) {
    const provider = this.ensureProvider();

    const directCandidates = ["signAndSendContractCall", "callContract", "sendContractCall", "invokeContract"];
    for (const direct of directCandidates) {
      if (typeof provider[direct] !== "function") continue;
      try {
        const result = await tryDirectOrRequest(provider, direct, direct, {
          contract: args.contract,
          method: args.method,
          args: args.callArgs
        });
        const tx = extractTxHash(result);
        if (tx) return tx;
      } catch {
        // continue
      }
    }

    const requestVariants: Array<{ method: string; params: unknown }> = [
      {
        method: "signAndSendContractCall",
        params: {
          contract: args.contract,
          method: args.method,
          args: args.callArgs
        }
      },
      {
        method: "callContract",
        params: {
          address: args.contract,
          method: args.method,
          args: args.callArgs
        }
      },
      {
        method: "sendContractCall",
        params: {
          contractAddress: args.contract,
          methodName: args.method,
          args: args.callArgs
        }
      },
      {
        method: "opnet_callContract",
        params: {
          to: args.contract,
          functionName: args.method,
          params: args.callArgs
        }
      }
    ];

    for (const variant of requestVariants) {
      try {
        const result = await safeRequest(provider, variant.method, variant.params);
        const tx = extractTxHash(result);
        if (tx) return tx;
      } catch {
        // continue
      }
    }

    throw new Error("Provider cannot sign/send contract calls. Use Manual Mode call instructions.");
  }
}

export function detectWallet(): WalletAdapter {
  const providers = getCandidateProviders();

  if (providers.length === 0) {
    return new WalletAdapter(
      {
        providerName: "No provider detected",
        mode: "manual",
        reason: "No wallet provider found on window.opwallet / opnet / bitcoin / unisat / ethereum",
        capabilities: {
          canConnect: false,
          canSendOp20: false,
          canSignAndSendContractCall: false
        }
      },
      null
    );
  }

  const preferred = providers[0];
  const capabilities = detectCapabilities(preferred.provider);
  const mode = capabilities.canConnect ? "wallet" : "manual";

  return new WalletAdapter(
    {
      providerName: preferred.providerName,
      mode,
      reason: mode === "manual" ? "Provider detected but no usable connect capability." : undefined,
      capabilities
    },
    preferred.provider
  );
}

