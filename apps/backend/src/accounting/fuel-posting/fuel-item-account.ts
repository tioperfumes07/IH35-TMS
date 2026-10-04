// The ONE rule for where a fuel purchase's cost posts: fuel type -> catalog item -> that item's default expense account
// (the QuickBooks item model: the account lives on the item, never on a parallel map).
//
// CC-2 2026-10-04. There used to be two rules. The expense document (fuel-expense-document.service.ts) resolved the
// item's account; the fuel poster (poster.service.ts, used by Banking's fuel match) resolved
// accounting.expense_category_account_map. That map's DEF row was moved to 5010 on 2026-09-22 and back to 5000 on
// 2026-09-23 (audit.row_changes, no role recorded), and its reefer row was always 5000. So a fuel purchase posted by the
// poster landed DEF in 5000 Fuel & Diesel and reefer diesel in 5000, while the same purchase as an expense document
// says 5010 / 5015. Live on 2026-10-04: 6 DEF purchases, $170.63, documents 5010 vs ledger 5000. Both writers now call
// this module, so the document and the ledger cannot disagree.

export type FuelItemClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

// fuel.fuel_transactions.fuel_type CHECK: 'diesel' | 'def' | 'gas' | 'reefer_diesel' | 'other' (verified live). Only
// these three have a real catalog item; 'gas' / 'other' refuse rather than post to a guessed account.
export const FUEL_TYPE_ITEM_NAME: Readonly<Record<string, string>> = {
  diesel: "Fuel-Truck Diesel",
  def: "Fuel-DEF-Diesel Exhaust Fluid",
  reefer_diesel: "Fuel-Reefer-Diesel",
};

export type FuelItemResolution = { itemId: string; expenseAccountId: string; itemName: string } | { refused: string };

/** The item named `itemName` (company row first, else the global one) and its default expense account. Never guesses. */
export async function resolveItemByName(client: FuelItemClient, operatingCompanyId: string, itemName: string): Promise<FuelItemResolution> {
  const res = await client.query<{ id: string; expense_account_id: string | null }>(
    `SELECT id::text, default_expense_account_id::text AS expense_account_id
       FROM catalogs.items
      WHERE item_name = $2 AND (operating_company_id = $1::uuid OR operating_company_id IS NULL)
      ORDER BY (operating_company_id = $1::uuid) DESC
      LIMIT 1`,
    [operatingCompanyId, itemName],
  );
  const row = res.rows[0];
  if (!row || !row.expense_account_id) {
    return { refused: `catalogs.items "${itemName}" not found or has no default_expense_account_id for company ${operatingCompanyId} — refusing rather than posting to a default` };
  }
  return { itemId: row.id, expenseAccountId: row.expense_account_id, itemName };
}

/** The fuel-type item and its account. */
export async function resolveFuelItem(client: FuelItemClient, operatingCompanyId: string, fuelType: string | null): Promise<FuelItemResolution> {
  const itemName = fuelType ? FUEL_TYPE_ITEM_NAME[fuelType] : undefined;
  if (!itemName) {
    return { refused: `fuel_type "${fuelType}" has no mapped catalogs.items entry — refusing rather than posting to a default (only diesel/def/reefer_diesel are mapped)` };
  }
  return resolveItemByName(client, operatingCompanyId, itemName);
}

/** The poster's fuel kinds (FUEL_CATEGORY_CODES) as fuel.fuel_transactions.fuel_type values; oil / misc have no item. */
export const POSTING_KIND_FUEL_TYPE: Readonly<Record<string, string | null>> = {
  diesel: "diesel",
  def: "def",
  reefer: "reefer_diesel",
  oil: null,
  misc: null,
};
