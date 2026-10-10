/**
 * ROUND 443.3 — what a Settlement Creator draft must satisfy BEFORE anything is written (the route books loads in
 * its own transaction ahead of the settlement post, so these refusals run first and leave zero rows).
 *
 * 1. A settlement where EVERY load is faro_transportation is not entered in USMCA (owner 2026-10-02: a full
 *    Transportation settlement keeps no record in the app).
 * 2. Invoice numbers (law doc §5: an empty, editable number box; typed value wins verbatim; blank = system assigns).
 *    The owner's Faro / QuickBooks invoice numbers for USMCA run 1..118 and are NOT the load number (load 13511 =
 *    invoice 1). Blank keeps the existing fallback: invoice number = load number. Each load's effective number must
 *    be unique inside the draft and not already taken by another load's invoice — a re-post of the same load keeps
 *    its own invoice (buildInvoiceFromLoad is idempotent per load).
 */
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { SettlementCreatorError } from "./settlement-creator.service.js";

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const FULL_TRANSPORTATION_MESSAGE = "Every load in this settlement is Transportation — it is not entered in USMCA.";
export const INVOICE_NUMBER_SHAPE = /^[0-9]{1,12}$/;

/** The number the load's invoice will carry: the typed Invoice no., else the load number. */
export function effectiveInvoiceNumber(load: { load_number: string; invoice_number?: string | null }): string {
  const typed = String(load.invoice_number ?? "").trim();
  return typed || String(load.load_number).trim();
}

/** Pure checks (no database). Returns the first refusal or null. */
export function draftAdmissionRefusal(draft: Pick<SettlementCreatorDraft, "loads">): SettlementCreatorError | null {
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
  const seen = new Map<string, string>();
  for (const l of loads) {
    const n = effectiveInvoiceNumber(l);
    const other = seen.get(n);
    if (other !== undefined) {
      return new SettlementCreatorError("invoice_number_duplicate", `Invoice no. ${n} is used by load ${other} and load ${l.load_number} in this settlement.`);
    }
    seen.set(n, l.load_number);
  }
  return null;
}

/** Pure checks + the company's existing invoices. Throws the first refusal; nothing is written. */
export async function assertCreatorDraftAdmissible(client: Queryable, draft: SettlementCreatorDraft): Promise<void> {
  const pure = draftAdmissionRefusal(draft);
  if (pure) throw pure;
  const wanted = draft.loads.map((l) => ({ load: l.load_number, number: effectiveInvoiceNumber(l) }));
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
        `Load ${w.load}: Invoice no. ${w.number} is already used by ${holder}. Nothing was written.`,
      );
    }
  }
}
