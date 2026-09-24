import { Card, CardContent } from "@/components/ui/card";

/**
 * Body of a route frame whose content is implemented by a later task. It says so plainly and
 * shows no data, so the frame never pretends to have evidence it does not read yet.
 */
export function PendingView({ name }: Readonly<{ name: string }>) {
  return (
    <Card className="border-border/90 bg-card/75 shadow-none">
      <CardContent className="px-6 py-10 text-sm text-muted-foreground">
        The {name} is not available in this build yet.
      </CardContent>
    </Card>
  );
}
