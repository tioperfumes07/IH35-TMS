/**
 * ROUND 443.3 — what a Settlement Creator draft must satisfy BEFORE anything is written (the route books loads in
 * its own transaction ahead of the settlement post, so these refusals run first and leave zero rows).
 *
 * 1. A settlement where EVERY load is faro_transportation is not entered in USMCA (owner 2026-10-02: a full
 *    Transportation settlement keeps no record in the app).
 * 2. Invoice numbers (law doc §5; owner 2026-10-10 2:57 PM CT: "All the invoices ... should have the invoice number
 *    and then load number"). The box takes the digits the owner presented to Faro / has in QuickBooks (USMCA 1..118).
 *    The Creator passes them as requestedDisplayId and the invoice service (CC-1 ROUND 443.8) builds
 *    <invoice>-<load>; blank -> the service assigns <next>-<load> (0-<load> for the authorized $0 invoice). The
 *    Creator never builds the dash format and never falls back to the load number. The same typed number on two
 *    loads is legal (59-13577, 59-13578); <typed>-<load> already on another load's invoice refuses before any write,
 *    and a re-post of the same load keeps its own invoice (buildInvoiceFromLoad is idempotent per load).
 */
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { SettlementCreatorError } from "./settlement-creator.service.js";
import { lineLoadRefusal } from "./settlement-creator-line-load.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const FULL_TRANSPORTATION_MESSAGE = "Every load in this settlement is Transportation — it is not entered in USMCA.";
export const INVOICE_NUMBER_SHAPE = /^[0-9]{1,12}$/;

/** The invoice number the service will build from a TYPED box (CC-1 443.8): <typed>-<load>. Null when blank. */
export function typedInvoiceDisplayId(load: { load_number: string; invoice_number?: string | null }): string | null {
  const typed = String(load.invoice_number ?? "").trim();
  return typed ? `${typed}-${String(load.load_number).trim()}` : null;
}

/** Pure checks (no database). Returns the first refusal or null. */
export function draftAdmissionRefusal(
  draft: Pick<SettlementCreatorDraft, "loads"> & Partial<Pick<SettlementCreatorDraft, "deductions" | "admin_fee_cents" | "fuel_purchases" | "expenses">>,
): SettlementCreatorError | null {
  const loads = draft.loads ?? [];
  if (loads.length > 0 && loads.every((l) => l.factoring === "faro_transportation")) {
    return new SettlementCreatorError("full_transportation_settlement", FULL_TRANSPORTATION_MESSAGE);
  }
  for (const l of loads) {
    const typed = String(l.invoice_number ?? "").trim();
    if (typed && !INVOICE_NUMBER_SHAPE.test(typed)) {
      return new SettlementCreatorError("invoice_number_invalid", `Load ${l.load_number}: Invoice no. "${typed}" must be digits only (1 to 12).`);
    }
  }
  const seen = new Set<string>();
  for (const l of loads) {
    const key = String(l.load_number).trim();
    if (seen.has(key)) return new SettlementCreatorError("load_number_duplicate", `Load ${key} appears twice in this settlement.`);
    seen.add(key);
  }
  // ROUND 443.5 — every deduction, admin fee and fuel line carries its load.
  const lineRefusal = lineLoadRefusal({ loads, deductions: draft.deductions, admin_fee_cents: draft.admin_fee_cents, fuel_purchases: draft.fuel_purchases, expenses: draft.expenses });
  if (lineRefusal) return lineRefusal;
  return null;
}

/** Pure checks + the company's existing invoices. Throws the first refusal; nothing is written. */
export async function assertCreatorDraftAdmissible(client: Queryable, draft: SettlementCreatorDraft): Promise<void> {
  const pure = draftAdmissionRefusal(draft);
  if (pure) throw pure;
  const wanted = draft.loads
    .map((l) => ({ load: l.load_number, number: typedInvoiceDisplayId(l) }))
    .filter((w): w is { load: string; number: string } => w.number !== null);
  if (wanted.length === 0) return;
  const res = await client.query(
    `SELECT i.display_id, l.load_number
       FROM accounting.invoices i
       LEFT JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id = $1::uuid AND i.display_id = ANY($2::text[])`,
    [draft.operating_company_id, wanted.map((w) => w.number)],
  );
  for (const w of wanted) {
    const taken = res.rows.find((r) => String(r.display_id) === w.number);
    if (taken && String(taken.load_number ?? "") !== w.load) {
      const holder = taken.load_number ? `load ${String(taken.load_number)}` : "an invoice with no load";
      throw new SettlementCreatorError(
        "invoice_number_taken",
        `Load ${w.load}: invoice ${w.number} is already used by ${holder}. Nothing was written.`,
      );
    }
  }
}
