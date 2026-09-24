import { Archive, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Where a Run comes from. Imported is an attribute of the evidence, not a fourth lifecycle
 * state: it is shown next to the status, prominent but not alarming.
 */
export function ProvenanceBadge({
  kind,
}: Readonly<{ kind: "native" | "imported" }>) {
  return kind === "imported" ? (
    <Badge variant="imported" className="gap-1.5">
      <Archive aria-hidden="true" className="size-3.5" />
      Imported
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1.5">
      <Terminal aria-hidden="true" className="size-3.5" />
      Native
    </Badge>
  );
}
