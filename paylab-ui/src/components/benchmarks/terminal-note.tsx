import { Terminal } from "lucide-react";

/**
 * Where a Benchmark Run comes from. The console only observes Runs; it never starts, cancels,
 * pauses, schedules, or narrows one, so there is deliberately no control next to this note.
 */
export function TerminalNote() {
  return (
    <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
      <Terminal aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>
        Benchmark Runs are started from the terminal. This console only observes
        them.
      </span>
    </p>
  );
}
