// ROUND 370 / 363-CC2-D — the Reclassify register's drill map and selection rule, shared by the Accounting register and
// the settlement wizard's post-result panel so the two surfaces can never disagree about where a line opens or whether
// it may be reclassified.
import type { ReclassifyLine } from "../api/reclassify";

/** ROUND 370 — every document type opens its own document (the account register's drill map), never a bare JE. */
export type DocKind = "expense" | "bill" | "invoice" | "payment" | "bill_payment" | "deposit" | "factoring_advance" | "cash_advance" | "settlement" | "load" | "fuel_transaction" | "transfer" | "journal_entry";
export function docKind(t: string | null): DocKind {
  switch ((t ?? "").toLowerCase()) {
    case "expense": return "expense";
    case "bill": return "bill";
    case "invoice": return "invoice";
    case "customer_payment": return "payment";
    case "bill_payment": return "bill_payment";
    case "deposit": case "bank_deposit": return "deposit";
    case "factoring_advance": return "factoring_advance";
    case "cash_advance": case "driver_advance": case "driver_cash_advance": return "cash_advance";
    case "settlement": case "driver_settlement": return "settlement";
    case "load": return "load";
    case "fuel_transaction": case "fuel_event": return "fuel_transaction";
    case "transfer": return "transfer";
    default: return "journal_entry";
  }
}
export function docTarget(l: ReclassifyLine): { kind: DocKind; id: string } {
  const kind = docKind(l.source_transaction_type);
  return kind !== "journal_entry" && l.source_transaction_id ? { kind, id: l.source_transaction_id } : { kind: "journal_entry", id: l.journal_entry_id };
}
/** Why a listed row cannot be selected (ROUND 370: it is shown because the balance counts it). */
export function notReclassifiable(l: ReclassifyLine): string | null {
  if (l.is_reversed) return "Reversed — its document was voided or corrected. Reclassify the live line, not the reversed one.";
  if (l.is_reversal) return "Reversal entry — undone by undoing what it reversed, not reclassified.";
  return null;
}
