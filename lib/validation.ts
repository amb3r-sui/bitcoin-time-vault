import { z } from "zod";

import { pillToRaw } from "@/lib/format";

const wholeNumber = z.string().regex(/^\d+$/, "Amount must be a whole number");

export const depositAmountSchema = wholeNumber.refine((v) => BigInt(v) > 0n, {
  message: "Amount must be greater than 0"
});

export const txidSchema = z
  .string()
  .trim()
  .min(16, "TXID is too short")
  .max(120, "TXID is too long");

export function parseDepositAmountToRaw(value: string) {
  const valid = depositAmountSchema.parse(value);
  return {
    whole: valid,
    raw: pillToRaw(valid)
  };
}

