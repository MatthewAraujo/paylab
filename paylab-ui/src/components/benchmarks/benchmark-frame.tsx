import type { ReactNode } from "react";
import { currentCapabilities } from "@/api/current-capabilities";
import { CapabilityUnavailable } from "@/components/capability-unavailable";
import { PageHeader } from "@/components/page-header";
import { TerminalNote } from "./terminal-note";

type BenchmarkFrameProps = {
  title: string;
  description: string;
  children?: ReactNode;
};

/**
 * The frame every benchmark route renders inside: page header, the terminal-only note, and
 * the honest state for a contract that does not describe Benchmarks. The route's own content is
 * passed as children by the task that implements it.
 */
export function BenchmarkFrame({
  title,
  description,
  children,
}: Readonly<BenchmarkFrameProps>) {
  if (!currentCapabilities.benchmarks) {
    return (
      <>
        <PageHeader title={title} description={description} />
        <CapabilityUnavailable
          title="Benchmarks contract is incomplete"
          description="The API's OpenAPI document does not describe every benchmark read the console needs yet. Refresh the contract with pnpm sync:api against a local API."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={title} description={description} />
      <div className="mb-6">
        <TerminalNote />
      </div>
      {children}
    </>
  );
}
