import { AlertTriangle } from "lucide-react";

import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { shortenAddress, shortHash } from "@/lib/format";

interface HeaderBarProps {
  vaultAddress: string;
  tokenId: string;
  walletAddress?: string;
  connectionMode: "wallet" | "manual";
}

export function HeaderBar({ vaultAddress, tokenId, walletAddress, connectionMode }: HeaderBarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bitcoin Time Vault</h1>
          <p className="text-sm text-muted-foreground">Last depositor wins after 60 seconds.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">OP_NET Testnet</Badge>
          <Badge variant="outline">PILL OP_20</Badge>
          <Badge variant={connectionMode === "wallet" ? "default" : "secondary"}>
            {connectionMode === "wallet" ? "Wallet Connected" : "Manual Mode"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Vault Address</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{shortenAddress(vaultAddress)}</span>
              <CopyButton value={vaultAddress} />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">PILL Token ID</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{shortHash(tokenId, 10, 8)}</span>
              <CopyButton value={tokenId} />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Wallet</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">{walletAddress ? shortenAddress(walletAddress) : "Not connected"}</span>
              {walletAddress ? <CopyButton value={walletAddress} /> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-400/40 bg-amber-100/40 px-4 py-2 text-sm text-amber-900">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Testnet only - do not use real funds.</span>
        </div>
      </div>
    </div>
  );
}

