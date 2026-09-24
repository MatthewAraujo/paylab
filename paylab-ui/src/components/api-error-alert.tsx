import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

/** A failed read, stated plainly. Children hold the recovery actions (retry, back link). */
export function ApiErrorAlert({
  title,
  message,
  children,
}: Readonly<{ title: string; message: string; children?: ReactNode }>) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-5"
    >
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {title}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {children ? <div className="mt-4 flex gap-6">{children}</div> : null}
    </div>
  );
}
