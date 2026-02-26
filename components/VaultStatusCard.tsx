import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPillRaw, shortenAddress, toDeadlineLabel } from "@/lib/format";
import type { VaultState } from "@/lib/types";

interface VaultStatusCardProps {
  state: VaultState | undefined;
  nowSec: number;
}

export function VaultStatusCard({ state, nowSec }: VaultStatusCardProps) {
  const deadlineInfo = toDeadlineLabel(state?.deadline ?? 0, nowSec);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Vault Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pot</div>
            <div className="mt-1 text-xl font-semibold">{formatPillRaw(state?.potRaw ?? "0")}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Leader</div>
            <div className="mt-1 text-sm font-medium">{state?.leader ? shortenAddress(state.leader) : "No leader yet"}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Round ID</div>
            <div className="mt-1 text-xl font-semibold">{state?.roundId ?? 0}</div>
          </div>
        </div>

        <div className="rounded-md border p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Countdown</div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">{deadlineInfo.label}</div>
          {deadlineInfo.expired ? (
            <Badge className="mt-3" variant="destructive">
              Leader can claim
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

