import {
  CircleCheck,
  CircleMinus,
  GitCompare,
  Plus,
  ServerOff,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type CompatibilityState =
  | "comparable"
  | "new"
  | "removed"
  | "changed"
  | "environment-incompatible"
  | "dataset-incompatible"
  | "not-recorded";

const states = {
  comparable: { label: "Comparable", variant: "completed", icon: CircleCheck },
  new: {
    label: "New",
    variant: "new",
    icon: Plus,
    hint: "No previous measurement",
  },
  removed: {
    label: "Removed",
    variant: "removed",
    icon: CircleMinus,
    hint: "Present only in the reference Run",
  },
  changed: {
    label: "Changed definition",
    variant: "changed",
    icon: GitCompare,
    hint: "The scenario definition differs, so its values are not comparable",
  },
  "environment-incompatible": {
    label: "Environment incompatible",
    variant: "incompatible",
    icon: ServerOff,
    hint: "The machine or PostgreSQL facts differ",
  },
  "dataset-incompatible": {
    label: "Dataset incompatible",
    variant: "incompatible",
    icon: TriangleAlert,
    hint: "The data the measurements were taken on differs",
  },
  "not-recorded": {
    label: "Not recorded",
    variant: "outline",
    icon: CircleMinus,
    hint: "The source did not record this value",
  },
} as const;

/** Whether a scenario or metric may take part in a Benchmark Comparison, and why not. */
export function CompatibilityBadge({
  state,
}: Readonly<{ state: CompatibilityState }>) {
  const entry = states[state];
  const Icon = entry.icon;

  return (
    <Badge
      variant={entry.variant}
      className="gap-1.5"
      title={"hint" in entry ? entry.hint : undefined}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {entry.label}
    </Badge>
  );
}
