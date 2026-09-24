import type { components } from "@/api/generated/schema";
import { readApi } from "@/api/read";

export type WalletPage = components["schemas"]["WalletPageResponse"];
export type Account = components["schemas"]["AccountResponse"];
export type Balance = components["schemas"]["BalanceResponse"];

export const loadWallets = (cursor?: string) =>
  readApi("Wallets", (client) =>
    client.GET("/v1/accounts", { params: { query: { cursor } } }),
  );

/** An unknown id, another Merchant's Wallet and the clearing Account are the same 404. */
export const loadAccount = (id: string) =>
  readApi("Wallet", (client) =>
    client.GET("/v1/accounts/{id}", { params: { path: { id } } }),
  );

export const loadBalance = (id: string) =>
  readApi("Balance", (client) =>
    client.GET("/v1/accounts/{id}/balance", { params: { path: { id } } }),
  );
