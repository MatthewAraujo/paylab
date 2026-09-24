import { CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type RunStatus = "RUNNING" | "COMPLETED" | "INCOMPLETE";

const statuses = {
  RUNNING: { variant: "running", icon: LoaderCircle },
  COMPLETED: { variant: "completed", icon: CircleCheck },
  INCOMPLETE: { variant: "incomplete", icon: TriangleAlert },
} as const;

/** The lifecycle of a Benchmark Run, in the canonical words, with a shape of its own. */
export function RunStatusBadge({ status }: Readonly<{ status: RunStatus }>) {
  const { variant, icon: Icon } = statuses[status];

  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </Badge>
  );
}
