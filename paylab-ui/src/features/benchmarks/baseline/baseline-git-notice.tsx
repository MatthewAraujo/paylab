import { GitBranch } from "lucide-react";
import type { BaselineView } from "../api/benchmark-api";

type GitState = BaselineView["git"];

/**
 * The reviewable Git change a Baseline selection leaves behind. It follows what the API reports
 * (the uncommitted files, a bounded list plus the total), so it stays true after a reload and
 * never claims that anything was committed.
 */
export function BaselineGitNotice({ git }: Readonly<{ git: GitState }>) {
  if (!git.available || git.dirtyCount === 0) {
    return null;
  }
  const hidden = git.dirtyCount - git.dirtyFiles.length;

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
      <p className="flex items-center gap-2 font-medium">
        <GitBranch aria-hidden="true" className="size-3.5" />
        {git.dirtyCount} {git.dirtyCount === 1 ? "file has" : "files have"}{" "}
        uncommitted changes
      </p>
      <ul className="space-y-0.5 font-mono">
        {git.dirtyFiles.map((file) => (
          <li key={file} className="break-all">
            {file}
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p>and {hidden} more</p> : null}
      <p className="text-muted-foreground">
        Review and commit them yourself. The next benchmark run refuses to start
        until they are committed.
      </p>
    </div>
  );
}
