import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        // Benchmark semantics. Meaning is always carried by text and an icon as well as color.
        completed: "border-success/40 bg-success/10 text-success",
        improved: "border-success/40 bg-success/10 text-success",
        running: "border-primary/50 bg-primary/10 text-primary",
        incomplete: "border-destructive/50 bg-destructive/10 text-destructive",
        regressed: "border-destructive/50 bg-destructive/10 text-destructive",
        stable: "border-border bg-muted text-foreground",
        imported: "border-border bg-secondary text-secondary-foreground",
        incompatible: "border-destructive/40 bg-transparent text-destructive",
        new: "border-primary/40 bg-transparent text-primary",
        removed:
          "border-border border-dashed bg-transparent text-muted-foreground",
        changed: "border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
