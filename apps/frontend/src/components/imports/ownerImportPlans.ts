import type { FaroSeedImportResult, LoadHistoryImportResult } from "../../api/ownerImports";
import type { OwnerImportPlan } from "./OwnerImportModal";
import { formatUsdCents } from "../../lib/money";

const LOAD_OUTCOME_LABEL: Record<string, string> = {
  booked_delivered: "Booked — delivered",
  booked_dispatched: "Booked — dispatched",
  would_book_delivered: "Will book — delivered",
  would_book_dispatched: "Will book — dispatched",
  skipped_existing: "Already in the app — skipped",
  not_booked_status: "Status not booked",
  refused: "Refused",
};

export function loadHistoryPlan(res: LoadHistoryImportResult): OwnerImportPlan {
  return {
    commit: res.commit,
    summary: `${res.row_count} loads: ${res.booked.count} ${res.commit ? "booked" : "to book"} (${formatUsdCents(res.booked.charges_cents)}), ${res.skipped_existing.count} already in the app, ${res.not_booked_status.count} status not booked, ${res.refused.count} refused`,
    rows: res.rows.map((r) => ({
      key: r.load_number,
      ref: `Load ${r.load_number}`,
      outcomeLabel: LOAD_OUTCOME_LABEL[r.outcome] ?? r.outcome,
      refused: r.outcome === "refused",
      reason: r.refusal ? `${r.refusal.code} — ${r.refusal.message}` : "",
      cents: r.charges_cents,
    })),
  };
}

const FARO_OUTCOME_LABEL: Record<string, string> = {
  already_present: "Already present",
  posted: "Posted",
  would_post: "Will post",
  held: "Held",
};

export function faroPurchasePlan(res: FaroSeedImportResult): OwnerImportPlan {
  return {
    commit: res.commit,
    summary: `${res.line_count} invoices: ${res.posted.count} ${res.commit ? "posted" : "to post"} (${formatUsdCents(res.posted.gross_cents)}), ${res.already_present.count} already present, ${res.held.count} held`,
    rows: res.lines.map((l) => ({
      key: l.faro_invoice_number,
      ref: `Invoice ${l.faro_invoice_number}`,
      outcomeLabel: FARO_OUTCOME_LABEL[l.outcome] ?? l.outcome,
      refused: l.outcome === "held",
      reason: l.reason ?? "",
      cents: l.gross_cents,
    })),
  };
}
