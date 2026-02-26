import { ExternalLink, RefreshCw } from "lucide-react";

import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { buildTxLink, formatPillRaw, formatUnixTime, shortHash, toDeadlineLabel } from "@/lib/format";
import type { VaultEvent } from "@/lib/types";

interface EventFeedProps {
  events: VaultEvent[];
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  explorerTxBase?: string;
  nowSec: number;
}

export function EventFeed({
  events,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
  isRefreshing,
  explorerTxBase,
  nowSec
}: EventFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Event Feed</CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Auto-refresh</span>
              <Switch checked={autoRefresh} onCheckedChange={onAutoRefreshChange} />
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              {isRefreshing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No events yet.
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event, index) => {
              const txLink = explorerTxBase ? buildTxLink(explorerTxBase, event.txHash) : "";
              const deadline = event.newDeadline ? toDeadlineLabel(event.newDeadline, nowSec).label : "-";
              return (
                <div key={`${event.txHash}-${index}`} className="rounded-md border p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={event.type === "Deposit" ? "secondary" : "destructive"}>{event.type}</Badge>
                    <span className="text-xs text-muted-foreground">Round {event.roundId}</span>
                  </div>

                  <div className="grid gap-1 text-xs sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Who: </span>
                      <span className="font-mono">{event.actor || "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount: </span>
                      <span>{formatPillRaw(event.amountRaw)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Pot After: </span>
                      <span>{event.potAfterRaw ? formatPillRaw(event.potAfterRaw) : "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Deadline: </span>
                      <span>{deadline}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Timestamp: </span>
                      <span>{formatUnixTime(event.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Tx: </span>
                      <span className="font-mono">{shortHash(event.txHash)}</span>
                      <CopyButton value={event.txHash} />
                      {txLink ? (
                        <a href={txLink} target="_blank" rel="noreferrer" className="inline-flex items-center text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

