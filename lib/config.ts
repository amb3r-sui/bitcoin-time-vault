import { z } from "zod";

export const PILL_TOKEN_ID = "opt1sqp5gx9k0nrqph3sy3aeyzt673dz7ygtqxcfdqfle";
export const ROUND_DURATION_SEC = 60;
export const PILL_DECIMALS = 8;

const publicConfigSchema = z.object({
  NEXT_PUBLIC_OPNET_RPC_URL: z.string().min(1, "NEXT_PUBLIC_OPNET_RPC_URL is required").url(),
  NEXT_PUBLIC_VAULT_ADDRESS: z.string().min(1, "NEXT_PUBLIC_VAULT_ADDRESS is required"),
  NEXT_PUBLIC_EXPLORER_TX: z.string().url().optional().or(z.literal("")).default(""),
  NEXT_PUBLIC_EXPLORER_ADDR: z.string().url().optional().or(z.literal("")).default("")
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

export function loadPublicConfig() {
  const parsed = publicConfigSchema.safeParse({
    NEXT_PUBLIC_OPNET_RPC_URL: process.env.NEXT_PUBLIC_OPNET_RPC_URL,
    NEXT_PUBLIC_VAULT_ADDRESS: process.env.NEXT_PUBLIC_VAULT_ADDRESS,
    NEXT_PUBLIC_EXPLORER_TX: process.env.NEXT_PUBLIC_EXPLORER_TX,
    NEXT_PUBLIC_EXPLORER_ADDR: process.env.NEXT_PUBLIC_EXPLORER_ADDR
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => `- ${i.message}`).join("\n")
    };
  }

  return {
    ok: true as const,
    data: parsed.data
  };
}

