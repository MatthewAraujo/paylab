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
};

function hasJsonSchema(container: SchemaContainer | undefined): boolean {
  return Boolean(container?.content?.["application/json"]?.schema);
}

function hasTypedResponse(operation: Operation | undefined): boolean {
  return Object.values(operation?.responses ?? {}).some(hasJsonSchema);
}

/**
 * The console is read-only, so a capability is available when every GET it needs
 * describes a JSON response. Write operations are never used and never required.
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
  };
}
