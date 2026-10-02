/**
 * ROUND 326 queue item 8 (G-09) — THE ITEM CATALOG + MAPPING ENGINE. The signed AlwaysTrack settlement PDF prints
 * an expense CATEGORY on every line; the app resolved it by keyword (`/\btoll\b/`, `/\bwash\s*out\b/`, ...) to an
 * item NAME, which produced the audit's drift and wrong items: "OTR-Mexico Tolls & Intl Bridge" fell to the USA
 * toll item (`\btoll\b` never matches "Tolls"), Fuel-Def reimbursements fell to Company Vehicle Fuel, and the
 * printed names never matched the app's names.
 *
 * This is the ONE map: PDF category -> catalogs.items id, exactly as ruled in docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md
 * (Lead, measured live; "USE THESE IDS, RESOLVE NOTHING BY NAME"). The resolver reads the item BY ID, asserts it is
 * the company's own active item with a default expense account, and refuses everything else by name — no keyword
 * guess, no name lookup, no number lookup, no default account. A category not on the map is a catalog decision for
 * the Lead / owner, never a guess here.
 */

export const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

export type SettlementPdfItem = {
  /** The category exactly as the signed PDF prints it (AlwaysTrack, source of truth). */
  pdfCategory: string;
  itemId: string;
  /** The item's name in the app (may differ from the PDF — the drift the map absorbs). */
  appItemName: string;
  accountNumber: string;
};

export const SETTLEMENT_PDF_ITEM_MAP: Readonly<Record<string, readonly SettlementPdfItem[]>> = {
  [USMCA_COMPANY_ID]: [
    { pdfCategory: "Fuel-DEF-Diesel Exhaust Fluid", itemId: "009b48f2-f7aa-4548-b155-cedf66f427d3", appItemName: "Fuel-DEF-Diesel Exhaust Fluid", accountNumber: "5000" },
    { pdfCategory: "Fuel-Reefer Diesel", itemId: "a2df9d70-b35b-45f3-bf86-9c32bdc0a1c5", appItemName: "Fuel-Reefer-Diesel", accountNumber: "5000" },
    { pdfCategory: "Scale Expense:OTR-Scale Expense", itemId: "2c31f4d3-1538-4190-87c3-adf2e7e1be12", appItemName: "OTR-Scale Expense", accountNumber: "5300" },
    { pdfCategory: "Driver Reimbursement-TPE-Scale Expense", itemId: "a0a97d92-8e54-41e6-ab0c-37cd23f39869", appItemName: "Driver Reimbursement-Scale Expense", accountNumber: "5300" },
    { pdfCategory: "Driver Reimbursement-TPE-Toll Expense", itemId: "b78568f4-4797-45e5-98b1-bf7c1b5c3cb3", appItemName: "Driver Reimbursement-TPE-Toll Expense", accountNumber: "5300" },
    { pdfCategory: "Driver Reimbursement-Fuel-Def", itemId: "a37d5b67-ac60-4825-8511-37771e719078", appItemName: "Driver Reimbursement-Fuel Def", accountNumber: "5000" },
    { pdfCategory: "OTR-Mexico Tolls & Intl Bridge Expense", itemId: "ea839892-2631-417e-b21d-ca361c238e89", appItemName: "Bridge Toll Expense-Mexico", accountNumber: "5300" },
    { pdfCategory: "Warehouse-Lumper Fee Expense", itemId: "e09e3a25-a4c0-404c-abf1-2bb7ac329e45", appItemName: "Warehouse Lumper Expense", accountNumber: "5310" },
    { pdfCategory: "Reefer Trailer-Washout Expense", itemId: "aa07ce99-127c-4a29-af59-68d2bb694ff6", appItemName: "Reefer-Trailer Washout Expense", accountNumber: "5320" },
    { pdfCategory: "TRACTOR-Washout Expense", itemId: "40d73df6-07c0-418f-9e37-c6d7cde5b7b8", appItemName: "TRACTOR-Washout Expense", accountNumber: "5320" },
    { pdfCategory: "Road Service-Trailer Tire Expense", itemId: "b92a27bc-7175-488b-8743-21a02916d6d5", appItemName: "Road Service-Trailer Tire Expense", accountNumber: "5500" },
    { pdfCategory: "Road Service-Truck Tire Expense", itemId: "d2b34f56-92b0-44f4-92ff-b149322070a7", appItemName: "Road Service-Truck Tire Expense", accountNumber: "5500" },
    { pdfCategory: "Road Service-Truck Repair", itemId: "3648d94a-aa3a-45dc-8446-e7128ba1f11a", appItemName: "Road Service-Truck Repair Expense", accountNumber: "5400" },
    { pdfCategory: "GAS", itemId: "e93a0c79-337f-4563-b0fc-d09c9b36e499", appItemName: "Driver Reimbursement-Company Vehicle Fuel", accountNumber: "5000" },
    { pdfCategory: "COMIDAS", itemId: "c4adde9e-6901-436b-b917-736f1943fb5d", appItemName: "Driver Meals Expense", accountNumber: "5100" },
  ],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every spelling one map entry answers to: the PDF category, its QBO child part ("A:B" -> "B"), the app name. */
function spellings(e: SettlementPdfItem): string[] {
  const out = new Set([norm(e.pdfCategory), norm(e.appItemName)]);
  if (e.pdfCategory.includes(":")) out.add(norm(e.pdfCategory.split(":").pop()!));
  return [...out];
}

export class SettlementPdfItemError extends Error {
  constructor(public code: "PDF_ITEM_COMPANY_NOT_MAPPED" | "PDF_CATEGORY_NOT_ON_MAP" | "PDF_ITEM_NOT_POSTABLE", message: string) {
    super(message);
    this.name = "SettlementPdfItemError";
  }
}

/**
 * Pure: the map entry for a PDF line. The printed category (description) must equal one spelling exactly; when the
 * extraction mis-captured another column into the description (the "Drv" flag, GUARD-WORKORDERS SETTLEMENT-EXTRACT-
 * Drv-COLUMN-MISPARSE), the longest category printed in the raw line wins. Never a keyword, never a partial word.
 */
export function matchSettlementPdfItem(operatingCompanyId: string, line: { description: string; raw?: string | null }): SettlementPdfItem | null {
  const entries = SETTLEMENT_PDF_ITEM_MAP[operatingCompanyId];
  if (!entries) return null;
  const d = norm(line.description ?? "");
  const exact = entries.find((e) => spellings(e).includes(d));
  if (exact) return exact;
  const raw = ` ${norm(line.raw ?? "")} `;
  let best: { e: SettlementPdfItem; len: number } | null = null;
  for (const e of entries) {
    for (const s of spellings(e)) {
      if (s.length > 3 && raw.includes(` ${s} `) && (!best || s.length > best.len)) best = { e, len: s.length };
    }
  }
  return best?.e ?? null;
}

type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

/** The item + its expense account for a PDF line, read BY ID; refuses by name when unmapped or not postable. */
export async function resolveSettlementPdfItem(
  client: Q,
  operatingCompanyId: string,
  line: { description: string; raw?: string | null; amountCents?: number }
): Promise<{ itemId: string; expenseAccountId: string; itemName: string; pdfCategory: string }> {
  if (!SETTLEMENT_PDF_ITEM_MAP[operatingCompanyId]) {
    throw new SettlementPdfItemError("PDF_ITEM_COMPANY_NOT_MAPPED", `No settlement PDF item map for company ${operatingCompanyId} — the map is per company and ruled by the Lead.`);
  }
  const hit = matchSettlementPdfItem(operatingCompanyId, line);
  if (!hit) {
    throw new SettlementPdfItemError("PDF_CATEGORY_NOT_ON_MAP", `PDF category "${line.description}"${line.amountCents != null ? ` (${line.amountCents}c)` : ""} is not on the canonical item map (docs/bus/00-CANONICAL-ITEM-AND-ACCOUNT-MAP.md) — refusing rather than guessing an item.`);
  }
  const row = (await client.query<{ id: string; item_name: string; expense_account_id: string | null }>(
    `SELECT id::text, item_name, default_expense_account_id::text AS expense_account_id
       FROM catalogs.items
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL`,
    [hit.itemId, operatingCompanyId]
  )).rows[0];
  if (!row?.expense_account_id) {
    throw new SettlementPdfItemError("PDF_ITEM_NOT_POSTABLE", `Item ${hit.itemId} ("${hit.appItemName}") for PDF category "${hit.pdfCategory}" is missing, inactive or has no default expense account in company ${operatingCompanyId}.`);
  }
  return { itemId: row.id, expenseAccountId: row.expense_account_id, itemName: row.item_name, pdfCategory: hit.pdfCategory };
}
