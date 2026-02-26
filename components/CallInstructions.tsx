import { CopyButton } from "@/components/CopyButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CallInstructionsProps {
  title: string;
  method: string;
  args: unknown[];
}

export function CallInstructions({ title, method, args }: CallInstructionsProps) {
  const argsJson = JSON.stringify(args, null, 2);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide">Method</div>
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1.5 font-mono text-xs text-foreground">
            <span>{method}</span>
            <CopyButton value={method} />
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide">Args</div>
          <div className="flex items-start justify-between gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
            <pre className="overflow-auto font-mono text-[11px] text-foreground">{argsJson}</pre>
            <CopyButton value={argsJson} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

