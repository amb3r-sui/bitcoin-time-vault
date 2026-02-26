import type { ConnectedWallet, WalletCapabilities, WalletDetectionResult } from "@/lib/types";

type UnknownProvider = {
  [key: string]: unknown;
  request?: (input: { method: string; params?: unknown }) => Promise<unknown>;
};

interface ProviderCandidate {
  providerName: string;
  provider: UnknownProvider;
}

const OP_PROVIDER_NAME_HINTS = ["OP_WALLET", "OP_NET"] as const;

const CONNECT_PROMPT_DIRECT_METHODS = ["connect", "requestAccounts", "requestAddress", "enable"] as const;

const CONNECT_PROMPT_REQUEST_METHODS = [
  "connect",
  "requestAccounts",
  "requestAddress",
  "opnet_requestAccounts",
  "wallet_requestAccounts",
  "btc_requestAccounts",
  "eth_requestAccounts"
] as const;

const CONNECT_PASSIVE_DIRECT_METHODS = ["accounts", "getAccounts", "getAddress"] as const;

const CONNECT_PASSIVE_REQUEST_METHODS = [
  "accounts",
  "getAccounts",
  "getAddress",
  "eth_accounts"
] as const;

const REQUEST_PARAM_VARIANTS: unknown[] = [undefined, [], {}];

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
    if (cast.result && typeof cast.result === "object") {
      const nested = cast.result as Record<string, unknown>;
      if (typeof nested.address === "string") return nested.address;
      if (typeof nested.account === "string") return nested.account;
      if (Array.isArray(nested.accounts) && typeof nested.accounts[0] === "string") return nested.accounts[0];
    }
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

  const addWithNested = (name: string, provider: unknown) => {
    push(name, provider);
    if (!provider || typeof provider !== "object") return;
    const object = provider as Record<string, unknown>;
    for (const key of ["provider", "wallet", "client"]) {
      const nested = object[key];
      if (nested && typeof nested === "object") {
        push(`${name}.${key}`, nested);
      }
    }
  };

  addWithNested("OP_WALLET (window.opwallet)", window.opwallet);
  addWithNested("OP_NET (window.opnet)", window.opnet);
  addWithNested("Bitcoin Provider (window.bitcoin)", window.bitcoin);
  addWithNested("UniSat (window.unisat)", (window as Window & { unisat?: unknown }).unisat);
  addWithNested("Ethereum Provider (window.ethereum)", window.ethereum);

  return list;
}

function hasAnyMethod(provider: UnknownProvider, names: string[]) {
  return names.some((name) => typeof provider[name] === "function");
}

function hasRequest(provider: UnknownProvider) {
  return typeof provider.request === "function";
}

function providerHasAnyConnectMethod(provider: UnknownProvider) {
  return hasAnyMethod(provider, [...CONNECT_PROMPT_DIRECT_METHODS, ...CONNECT_PASSIVE_DIRECT_METHODS]);
}

function providerScore(candidate: ProviderCandidate) {
  const caps = detectCapabilities(candidate.provider);
  let score = 0;
  if (caps.canConnect) score += 8;
  if (caps.canSendOp20) score += 5;
  if (caps.canSignAndSendContractCall) score += 5;
  if (hasRequest(candidate.provider)) score += 1;
  if (candidate.providerName.includes("OP_WALLET")) score += 2;
  if (candidate.providerName.includes("OP_NET")) score += 2;
  if (candidate.providerName.includes("UniSat")) score += 1;
  return score;
}

function pickPreferredProvider(providers: ProviderCandidate[]) {
  const sorted = providers.slice().sort((a, b) => providerScore(b) - providerScore(a));
  const opPreferred = sorted.find((candidate) =>
    OP_PROVIDER_NAME_HINTS.some((hint) => candidate.providerName.includes(hint))
  );
  return opPreferred ?? sorted[0];
}

function detectCapabilities(provider: UnknownProvider): WalletCapabilities {
  const canConnect = providerHasAnyConnectMethod(provider) || hasRequest(provider);

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

async function safeRequestAny(provider: UnknownProvider, method: string) {
  let lastError: unknown;
  for (const params of REQUEST_PARAM_VARIANTS) {
    try {
      return await safeRequest(provider, method, params);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`request(${method}) failed`);
}

function readAddressFromProviderState(provider: UnknownProvider): string | null {
  const directFields = [
    provider.selectedAddress,
    provider.address,
    provider.account,
    provider.currentAccount,
    provider.defaultAccount
  ];
  for (const value of directFields) {
    const address = extractAddress(value);
    if (address) return address;
  }
  if (Array.isArray(provider.accounts) && provider.accounts.length > 0) {
    const address = extractAddress(provider.accounts);
    if (address) return address;
  }
  return null;
}

async function readAddressFallback(provider: UnknownProvider): Promise<string | null> {
  const stateAddress = readAddressFromProviderState(provider);
  if (stateAddress) return stateAddress;

  const directMethods = ["getAddress", "requestAddress", "getAccounts", "accounts"];
  for (const method of directMethods) {
    if (typeof provider[method] !== "function") continue;
    const fn = provider[method] as (...args: unknown[]) => Promise<unknown>;
    for (const args of [undefined, {}, []] as const) {
      try {
        const result = args === undefined ? await fn() : await fn(args);
        const address = extractAddress(result);
        if (address) return address;
      } catch {
        // continue
      }
    }
  }

  if (provider.request) {
    const requestMethods = ["getAddress", "requestAddress", "getAccounts", "accounts", "eth_accounts"];
    for (const method of requestMethods) {
      try {
        const result = await safeRequestAny(provider, method);
        const address = extractAddress(result);
        if (address) return address;
      } catch {
        // continue
      }
    }
  }

  return null;
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
  const directCandidates = ["getNetwork", "network", "chain", "chainId", "getChainId"];

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

  const requestCandidates = [
    "getNetwork",
    "opnet_getNetwork",
    "opnet_getChain",
    "opnet_chainId",
    "eth_chainId"
  ];
  for (const method of requestCandidates) {
    try {
      const result = await safeRequestAny(provider, method);
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
      throw new Error("Wallet provider not available.");
    }
    return this.provider;
  }

  async connect(): Promise<ConnectedWallet> {
    const provider = this.ensureProvider();
    const errors: string[] = [];
    const alreadyConnected = await readAddressFallback(provider);

    for (const method of CONNECT_PROMPT_DIRECT_METHODS) {
      if (typeof provider[method] !== "function") continue;
      const fn = provider[method] as (...args: unknown[]) => Promise<unknown>;
      for (const args of [undefined, {}, []] as const) {
        try {
          const result = args === undefined ? await fn() : await fn(args);
          const address = extractAddress(result) ?? (await readAddressFallback(provider));
          if (!address) continue;
          const network = await getNetwork(provider);
          this.connectedAddress = address;
          this.connectedNetwork = network;
          return { address, network };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          errors.push(`direct:${String(method)}(${args === undefined ? "no-args" : typeof args}): ${message}`);
        }
      }
    }

    if (provider.request) {
      for (const method of CONNECT_PROMPT_REQUEST_METHODS) {
        try {
          const result = await safeRequestAny(provider, method);
          const address = extractAddress(result) ?? (await readAddressFallback(provider));
          if (!address) continue;
          const network = await getNetwork(provider);
          this.connectedAddress = address;
          this.connectedNetwork = network;
          return { address, network };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          errors.push(`request:${String(method)}: ${message}`);
        }
      }
    }

    for (const method of CONNECT_PASSIVE_DIRECT_METHODS) {
      if (typeof provider[method] !== "function") continue;
      const fn = provider[method] as (...args: unknown[]) => Promise<unknown>;
      for (const args of [undefined, {}, []] as const) {
        try {
          const result = args === undefined ? await fn() : await fn(args);
          const address = extractAddress(result) ?? (await readAddressFallback(provider));
          if (!address) continue;
          const network = await getNetwork(provider);
          this.connectedAddress = address;
          this.connectedNetwork = network;
          return { address, network };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          errors.push(`direct-passive:${String(method)}(${args === undefined ? "no-args" : typeof args}): ${message}`);
        }
      }
    }

    if (provider.request) {
      for (const method of CONNECT_PASSIVE_REQUEST_METHODS) {
        try {
          const result = await safeRequestAny(provider, method);
          const address = extractAddress(result) ?? (await readAddressFallback(provider));
          if (!address) continue;
          const network = await getNetwork(provider);
          this.connectedAddress = address;
          this.connectedNetwork = network;
          return { address, network };
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          errors.push(`request-passive:${String(method)}: ${message}`);
        }
      }
    }

    if (alreadyConnected) {
      const network = await getNetwork(provider);
      this.connectedAddress = alreadyConnected;
      this.connectedNetwork = network;
      return { address: alreadyConnected, network };
    }

    const methodKeys = Object.keys(provider).filter((key) => typeof provider[key] === "function");
    throw new Error(
      `Unable to connect wallet with detected provider methods. Provider=${this.detection.providerName}. Methods=${methodKeys.join(", ")}. Errors=${errors.slice(0, 6).join(" | ")}`
    );
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

    throw new Error("Provider cannot send OP_20 transfer in-app.");
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

    throw new Error("Provider cannot sign/send contract calls in-app.");
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

  const preferred = pickPreferredProvider(providers);
  const capabilities = detectCapabilities(preferred.provider);
  const isOpProvider = OP_PROVIDER_NAME_HINTS.some((hint) => preferred.providerName.includes(hint));
  const mode = isOpProvider && capabilities.canConnect ? "wallet" : "manual";

  return new WalletAdapter(
    {
      providerName: preferred.providerName,
      mode,
      reason:
        mode === "manual"
          ? isOpProvider
            ? "Provider detected but no usable connect capability."
            : `Detected non-OP provider (${preferred.providerName}). Install or enable OP_WALLET / OP_NET provider.`
          : undefined,
      capabilities
    },
    preferred.provider
  );
}
