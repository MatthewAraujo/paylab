const defaultApiUrl = "http://localhost:3333";

export function getApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_PAYLAB_API_URL?.trim() || defaultApiUrl;
  return value.replace(/\/$/, "");
}
