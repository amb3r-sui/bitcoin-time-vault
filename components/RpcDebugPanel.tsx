"use client";

import { useState } from "react";
import { Bug, ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RpcDebugEntry } from "@/lib/types";

interface RpcDebugPanelProps {
  entries: RpcDebugEntry[];
}

export function RpcDebugPanel({ entries }: RpcDebugPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Bug className="h-4 w-4" />
            RPC Debug Panel
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
            {open ? (
              <>
                Hide <ChevronUp className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Show <ChevronDown className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-2">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No RPC calls yet.</p>
          ) : (
            entries
              .slice()
              .reverse()
              .slice(0, 60)
              .map((entry) => (
                <div key={entry.id} className="rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{entry.time}</span>
                    <span>{entry.action}</span>
                    <span className="font-mono">{entry.method}</span>
                    <span className={entry.status === "ok" ? "text-emerald-600" : "text-destructive"}>
                      {entry.status}
                    </span>
                  </div>
                  {entry.error ? <pre className="mt-1 whitespace-pre-wrap text-destructive">{entry.error}</pre> : null}
                </div>
              ))
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

