import { ArrowDownRight, ArrowUpRight, Equal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Classification = "improved" | "stable" | "regressed";

const classifications = {
  improved: { label: "Improved", variant: "improved", icon: ArrowUpRight },
  stable: { label: "Stable", variant: "stable", icon: Equal },
  regressed: { label: "Regressed", variant: "regressed", icon: ArrowDownRight },
} as const;

/**
 * A Performance Change after metric direction and the 5% tolerance were applied. The word and
 * the shape carry the meaning; color only reinforces it.
 */
export function ChangeBadge({
  classification,
}: Readonly<{ classification: Classification }>) {
  const { label, variant, icon: Icon } = classifications[classification];

  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </Badge>
  );
}
