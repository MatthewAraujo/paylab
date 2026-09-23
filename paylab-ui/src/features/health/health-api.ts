export type Health = {
  status: string;
  app: string;
  environment: string;
};

function isHealth(value: unknown): value is Health {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.status === "string" &&
    typeof candidate.app === "string" &&
    typeof candidate.environment === "string"
  );
}

export async function fetchHealth(
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<Health> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/health`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health request failed with HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  if (!isHealth(data)) {
    throw new Error("Health response does not match the expected contract");
  }

  return data;
}
