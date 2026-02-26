import type { RpcActionName, RpcDebugEntry } from "@/lib/types";

export const getContractStateCandidates = [
  "opnet_getContractState",
  "op_getContractState",
  "opnet_contractState",
  "getContractState"
] as const;

export const getContractEventsCandidates = [
  "opnet_getContractEvents",
  "op_getEvents",
  "opnet_events",
  "getContractEvents"
] as const;

export const getTxCandidates = [
  "opnet_getTransaction",
  "op_getTransaction",
  "getTransaction",
  "tx_get"
] as const;

export const sendTxCandidates = [
  "opnet_sendRawTransaction",
  "op_sendRawTransaction",
  "sendRawTransaction",
  "broadcastTransaction"
] as const;

type JsonRpcParams = Record<string, unknown> | unknown[] | undefined;

interface JsonRpcSuccess<T> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

export class OpnetRpcError extends Error {
  readonly method: string;
  readonly code?: number;
  readonly status?: number;
  readonly data?: unknown;

  constructor(args: { message: string; method: string; code?: number; status?: number; data?: unknown }) {
    super(args.message);
    this.name = "OpnetRpcError";
    this.method = args.method;
    this.code = args.code;
    this.status = args.status;
    this.data = args.data;
  }
}

interface OpnetRpcClientOptions {
  rpcUrl: string;
  onDebug?: (entry: RpcDebugEntry) => void;
}

export class OpnetRpcClient {
  private readonly rpcUrl: string;
  private readonly onDebug?: (entry: RpcDebugEntry) => void;
  private requestId = 1;
  private debugId = 1;
  private resolvedMethodMemory = new Map<string, string>();

  constructor(options: OpnetRpcClientOptions) {
    this.rpcUrl = options.rpcUrl;
    this.onDebug = options.onDebug;
  }

  private debug(args: {
    action: string;
    method: string;
    status: "ok" | "error";
    params: unknown;
    result?: unknown;
    error?: string;
  }) {
    if (!this.onDebug) return;
    this.onDebug({
      id: this.debugId++,
      time: new Date().toLocaleTimeString(),
      action: args.action,
      method: args.method,
      status: args.status,
      params: args.params,
      result: args.result,
      error: args.error
    });
  }

  private cacheKey(actionName: string) {
    return `btv1.rpc.resolved.${actionName}`;
  }

  private readCachedMethod(actionName: string) {
    if (typeof window === "undefined") return null;
    const key = this.cacheKey(actionName);
    return window.localStorage.getItem(key);
  }

  private writeCachedMethod(actionName: string, method: string) {
    if (typeof window === "undefined") return;
    const key = this.cacheKey(actionName);
    window.localStorage.setItem(key, method);
  }

  private uniqueMethods(methods: Array<string | undefined | null>) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const method of methods) {
      if (!method) continue;
      if (seen.has(method)) continue;
      seen.add(method);
      result.push(method);
    }
    return result;
  }

  private async rawCall<T>(method: string, params: JsonRpcParams, actionLabel: string): Promise<T> {
    const payload = {
      jsonrpc: "2.0" as const,
      id: this.requestId++,
      method,
      params: params ?? {}
    };

    let response: Response;
    try {
      response = await fetch(this.rpcUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network failure";
      this.debug({
        action: actionLabel,
        method,
        status: "error",
        params: payload.params,
        error: message
      });
      throw new OpnetRpcError({
        method,
        message
      });
    }

    if (!response.ok) {
      const message = `HTTP ${response.status}: ${response.statusText}`;
      this.debug({
        action: actionLabel,
        method,
        status: "error",
        params: payload.params,
        error: message
      });
      throw new OpnetRpcError({
        method,
        status: response.status,
        message
      });
    }

    let json: JsonRpcResponse<T>;
    try {
      json = (await response.json()) as JsonRpcResponse<T>;
    } catch {
      const message = "Invalid JSON-RPC response";
      this.debug({
        action: actionLabel,
        method,
        status: "error",
        params: payload.params,
        error: message
      });
      throw new OpnetRpcError({
        method,
        message
      });
    }

    if ("error" in json) {
      const message = json.error.message || "JSON-RPC error";
      this.debug({
        action: actionLabel,
        method,
        status: "error",
        params: payload.params,
        error: message
      });
      throw new OpnetRpcError({
        method,
        code: json.error.code,
        data: json.error.data,
        message
      });
    }

    this.debug({
      action: actionLabel,
      method,
      status: "ok",
      params: payload.params,
      result: json.result
    });
    return json.result;
  }

  async resolveMethod(
    actionName: RpcActionName,
    candidates: readonly string[],
    testParams: JsonRpcParams
  ): Promise<string> {
    const cached = this.readCachedMethod(actionName);
    const methods = this.uniqueMethods([cached, ...candidates]);
    const errors: string[] = [];

    for (const method of methods) {
      try {
        await this.rawCall(method, testParams, `${actionName}:resolve`);
        this.resolvedMethodMemory.set(actionName, method);
        this.writeCachedMethod(actionName, method);
        return method;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown resolution error";
        errors.push(`${method}: ${message}`);
      }
    }

    throw new Error(
      `Unable to resolve RPC method for action "${actionName}". Tried: ${methods.join(", ")}\n${errors.join("\n")}`
    );
  }

  async callWithResolver<T>(
    actionName: RpcActionName,
    candidates: readonly string[],
    params: JsonRpcParams,
    testParams: JsonRpcParams
  ): Promise<T> {
    const cached =
      this.resolvedMethodMemory.get(actionName) ?? this.readCachedMethod(actionName) ?? undefined;

    if (cached) {
      try {
        const result = await this.rawCall<T>(cached, params, actionName);
        this.resolvedMethodMemory.set(actionName, cached);
        return result;
      } catch {
        // fallback to re-resolution below
      }
    }

    const method = await this.resolveMethod(actionName, candidates, testParams);
    const result = await this.rawCall<T>(method, params, actionName);
    this.resolvedMethodMemory.set(actionName, method);
    return result;
  }
}

