import { PILL_DECIMALS } from "@/lib/config";

const pillScale = BigInt(10 ** PILL_DECIMALS);

export function shortHash(value: string, start = 8, end = 6) {
  if (!value) return "-";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function shortenAddress(address: string) {
  return shortHash(address, 8, 6);
}

export function parseBigintSafe(value: string | number | bigint | undefined | null, fallback = 0n) {
  if (value === undefined || value === null) return fallback;
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.trunc(value));
    if (value.trim() === "") return fallback;
    return BigInt(value);
  } catch {
    return fallback;
  }
}

export function rawToPill(raw: string | bigint) {
  const amount = typeof raw === "bigint" ? raw : parseBigintSafe(raw, 0n);
  const whole = amount / pillScale;
  const fraction = amount % pillScale;
  if (fraction === 0n) {
    return whole.toString();
  }
  const fractionText = fraction.toString().padStart(PILL_DECIMALS, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionText}`;
}

export function pillToRaw(whole: string) {
  const normalized = whole.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("PILL amount must be a whole number");
  }
  return (BigInt(normalized) * pillScale).toString();
}

export function formatPillRaw(raw: string) {
  return `${rawToPill(raw)} PILL`;
}

export function toDeadlineLabel(deadline: number, nowSec: number) {
  if (!deadline) {
    return {
      remaining: null as number | null,
      label: "Round not started",
      expired: false
    };
  }

  const remaining = Math.max(0, deadline - nowSec);
  if (remaining === 0) {
    return {
      remaining,
      label: "Expired - leader can claim",
      expired: true
    };
  }

  return {
    remaining,
    label: `${remaining}s`,
    expired: false
  };
}

export function formatUnixTime(unixSec?: number) {
  if (!unixSec) return "-";
  return new Date(unixSec * 1000).toLocaleString();
}

export function buildTxLink(base: string, txHash: string) {
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${txHash}`;
}

export function buildAddressLink(base: string, address: string) {
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${address}`;
}

