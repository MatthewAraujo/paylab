type SchemaContainer = {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
};

type Operation = {
  responses?: Record<string | number, SchemaContainer>;
};

type OpenApiDocument = {
  paths?: Record<string, Partial<Record<string, Operation>>>;
};

export type Capabilities = {
  health: boolean;
  dashboard: boolean;
  accounts: boolean;
  payments: boolean;
  ledger: boolean;
  /** Every Benchmarks read route the console uses is typed in the contract. */
  benchmarks: boolean;
  /** The single write the console makes: selecting the Benchmark Baseline. */
  benchmarkBaselineWrite: boolean;
};

function hasJsonSchema(container: SchemaContainer | undefined): boolean {
  return Boolean(container?.content?.["application/json"]?.schema);
}

function hasTypedResponse(operation: Operation | undefined): boolean {
  return Object.values(operation?.responses ?? {}).some(hasJsonSchema);
}

// Every read the Benchmarks area needs. The Artifact download is a plain link, not a typed read.
const BENCHMARK_READ_PATHS = [
  "/v1/benchmarks/status",
  "/v1/benchmarks/runs",
  "/v1/benchmarks/runs/{runId}",
  "/v1/benchmarks/runs/{runId}/progress",
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}",
  "/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content",
  "/v1/benchmarks/comparisons/default",
  "/v1/benchmarks/comparisons",
  "/v1/benchmarks/trends",
  "/v1/benchmarks/baseline",
] as const;

/**
 * The console is read-only, so a capability is available when every GET it needs
 * describes a JSON response. The only write it ever makes is selecting the Benchmark
 * Baseline; it has its own flag, so Benchmarks stay usable when that write is absent.
 */
export function deriveCapabilities(document: OpenApiDocument): Capabilities {
  const paths = document.paths ?? {};
  const listAccounts = paths["/v1/accounts"]?.get;
  const getAccount = paths["/v1/accounts/{id}"]?.get;
  const getBalance = paths["/v1/accounts/{id}/balance"]?.get;
  const getEntries = paths["/v1/accounts/{id}/entries"]?.get;
  const listPayments = paths["/v1/payments"]?.get;
  const getPayment = paths["/v1/payments/{id}"]?.get;
  const dailyReport = paths["/v1/reports/daily"]?.get;

  return {
    health: Boolean(paths["/health"]?.get),
    dashboard: hasTypedResponse(dailyReport),
    accounts:
      hasTypedResponse(listAccounts) &&
      hasTypedResponse(getAccount) &&
      hasTypedResponse(getBalance),
    payments: hasTypedResponse(listPayments) && hasTypedResponse(getPayment),
    ledger: hasTypedResponse(getEntries),
    benchmarks: BENCHMARK_READ_PATHS.every((path) =>
      hasTypedResponse(paths[path]?.get),
    ),
    benchmarkBaselineWrite: hasTypedResponse(
      paths["/v1/benchmarks/baseline"]?.put,
    ),
  };
}
