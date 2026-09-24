import { CheckCircle2, Circle, Loader, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PaymentStatus } from "./payments-filters";

// Every status carries an icon and a word, so meaning never depends on color alone.
const STATUS = {
  CREATED: { label: "Created", Icon: Circle, tone: "text-muted-foreground" },
  PROCESSING: { label: "Processing", Icon: Loader, tone: "text-amber-200" },
  SUCCEEDED: {
    label: "Succeeded",
    Icon: CheckCircle2,
    tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  },
  FAILED: {
    label: "Failed",
    Icon: XCircle,
    tone: "border-destructive/40 bg-destructive/10 text-red-200",
  },
} as const;

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { label, Icon, tone } = STATUS[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5", tone)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Badge>
  );
}
