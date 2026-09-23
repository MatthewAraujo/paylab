import { CircleSlash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type CapabilityUnavailableProps = {
  title: string;
  description: string;
};

export function CapabilityUnavailable({
  title,
  description,
}: CapabilityUnavailableProps) {
  return (
    <Card className="grid min-h-80 place-items-center border-border/90 bg-card/75 text-center shadow-none">
      <CardContent className="max-w-xl px-6 py-12">
        <div className="mx-auto mb-5 grid size-12 place-items-center rounded-xl border bg-accent text-primary">
          <CircleSlash2 aria-hidden="true" className="size-5" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
