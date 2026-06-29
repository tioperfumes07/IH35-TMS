import { apiRequest } from "./client";

export type DetailType = {
  id: string;
  name: string;
  sortOrder: number;
};

export type AccountTypeCatalogEntry = {
  id: string;
  code: string;
  accountType: string;
  group: string;
  statement: string;
  normalBalance: string;
  defaultAction: string;
  sortOrder: number;
  detailTypes: DetailType[];
};

/**
 * Read-only Account Type / Detail-Type taxonomy (QBO-parity COA type system).
 * Backend: GET /api/v1/accounting/account-type-catalog (catalogs.account_types +
 * catalogs.detail_types). The TYPE taxonomy is universal accounting (global, correct);
 * account INSTANCES are per-entity (catalogs.accounts, shown on the Chart of Accounts).
 */
export function getAccountTypeCatalog() {
  return apiRequest<AccountTypeCatalogEntry[]>("/api/v1/accounting/account-type-catalog");
}
