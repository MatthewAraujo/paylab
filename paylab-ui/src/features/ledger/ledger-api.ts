import type { components } from "@/api/generated/schema";
import { readApi } from "@/api/read";

export type EntryPage = components["schemas"]["LedgerEntryPageResponse"];

/** Only the owner can read a Wallet's history; anything else is the same 404. */
export const loadEntries = (accountId: string, cursor?: string) =>
  readApi("Ledger Entries", (client) =>
    client.GET("/v1/accounts/{id}/entries", {
      params: { path: { id: accountId }, query: { cursor } },
    }),
  );
