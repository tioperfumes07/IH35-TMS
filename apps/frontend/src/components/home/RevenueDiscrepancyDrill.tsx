/**
 * Accessible forward drill for Home revenue↔GL discrepancies (0280-02).
 * Uses API-provided hrefs (`/accounting/invoices/:id`, `/accounting/journal-entries/:id`).
 */
import { entityLabel } from "../../lib/entity-label";
import { Link } from "react-router-dom";
import type { HomeRevenueInvoiceDrill, HomeRevenueJournalDrill } from "../../api/home";
import { formatUsdFromCents } from "../../pages/home/HomeKpiCard";

type Props = {
  invoices?: HomeRevenueInvoiceDrill[];
  journals?: HomeRevenueJournalDrill[];
  discrepancyCount?: number;
  discrepancyCents?: number;
};

function reasonLabel(reason: string): string {
  switch (reason) {
    case "missing_je":
      return "Missing JE";
    case "wrong_account":
      return "Wrong account";
    case "amount_mismatch":
      return "Amount mismatch";
    case "voided_je":
      return "Voided JE";
    case "unlinked_gl_revenue":
      return "Unlinked GL revenue";
    default:
      return reason;
  }
}

export function RevenueDiscrepancyDrill({
  invoices = [],
  journals = [],
  discrepancyCount = 0,
  discrepancyCents = 0,
}: Props) {
  if (discrepancyCount <= 0 && invoices.length === 0 && journals.length === 0) {
    return null;
  }

  const unlinked = journals.filter((j) => j.reason === "unlinked_gl_revenue");

  return (
    <section
      className="mt-2 rounded-sm border border-amber-200 bg-amber-50/80 px-2 py-2 text-xs text-slate-800"
      aria-labelledby="revenue-discrepancy-heading"
      data-testid="revenue-discrepancy-drill"
    >
      <h3 id="revenue-discrepancy-heading" className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
        Revenue discrepancies
        {discrepancyCount > 0 ? ` (${discrepancyCount}` : ""}
        {discrepancyCount > 0 && discrepancyCents > 0 ? ` · ${formatUsdFromCents(discrepancyCents)}` : ""}
        {discrepancyCount > 0 ? ")" : ""}
      </h3>
      <p className="mt-1 text-[11px] text-slate-600">
        Open mismatched invoices or journal entries. Links use server-provided paths.
      </p>
      <ul className="mt-2 space-y-1" role="list">
        {invoices.map((inv) => (
          <li key={`inv-${inv.invoice_id}-${inv.reason}`}>
            <Link
              to={inv.href}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-sm px-1 py-0.5 font-medium text-[#1F2A44] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F2A44]"
              data-testid={`revenue-drill-invoice-${inv.invoice_id}`}
            >
              <span className="font-mono">{entityLabel(inv.display_id, inv.invoice_id, "Invoice")}</span>
              <span aria-hidden="true">·</span>
              <span>{reasonLabel(inv.reason)}</span>
              <span className="sr-only">
                {` Invoice ${inv.display_id ?? inv.invoice_id}, ${reasonLabel(inv.reason)}, ${formatUsdFromCents(inv.invoice_revenue_cents)}`}
              </span>
            </Link>
          </li>
        ))}
        {unlinked.map((je) => (
          <li key={`je-${je.journal_entry_id}-${je.reason}`}>
            <Link
              to={je.href}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-sm px-1 py-0.5 font-medium text-[#1F2A44] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F2A44]"
              data-testid={`revenue-drill-je-${je.journal_entry_id}`}
            >
              <span className="font-mono">JE {je.journal_entry_id.slice(0, 8)}</span>
              <span aria-hidden="true">·</span>
              <span>{reasonLabel(je.reason)}</span>
              <span className="sr-only">
                {` Journal entry ${je.journal_entry_id}, ${reasonLabel(je.reason)}, ${formatUsdFromCents(je.gl_revenue_cents)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
