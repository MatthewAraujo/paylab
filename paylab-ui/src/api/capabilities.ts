type SchemaContainer = {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
};

type Operation = {
  requestBody?: SchemaContainer;
  responses?: Record<string | number, SchemaContainer>;
};

type OpenApiDocument = {
  paths?: Record<string, Partial<Record<"get" | "post", Operation>>>;
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

function hasTypedRequest(operation: Operation | undefined): boolean {
  return hasJsonSchema(operation?.requestBody);
}

export function deriveCapabilities(document: OpenApiDocument): Capabilities {
  const paths = document.paths ?? {};
  const createAccount = paths["/v1/accounts"]?.post;
  const getAccount = paths["/v1/accounts/{id}"]?.get;
  const getBalance = paths["/v1/accounts/{id}/balance"]?.get;
  const getEntries = paths["/v1/accounts/{id}/entries"]?.get;
  const createPayment = paths["/v1/payments"]?.post;
  const listPayments = paths["/v1/payments"]?.get;
  const getPayment = paths["/v1/payments/{id}"]?.get;
  const dailyReport = paths["/v1/reports/daily"]?.get;

  return {
    health: Boolean(paths["/health"]?.get),
    dashboard: hasTypedResponse(dailyReport),
    accounts:
      hasTypedRequest(createAccount) &&
      hasTypedResponse(createAccount) &&
      hasTypedResponse(getAccount) &&
      hasTypedResponse(getBalance),
    payments:
      hasTypedRequest(createPayment) &&
      hasTypedResponse(createPayment) &&
      hasTypedResponse(listPayments) &&
      hasTypedResponse(getPayment),
    ledger: hasTypedResponse(getEntries),
  };
}
