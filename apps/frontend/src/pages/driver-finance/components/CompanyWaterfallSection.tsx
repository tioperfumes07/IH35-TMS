import { formatUsdCents } from "../../../lib/money";
import type { TourReadout } from "../../../api/tourReadout";
import type { CompanySettlementReport } from "../../../api/accounting";

const DASH = "—";
const money = (c: number | null | undefined) => (c == null ? DASH : formatUsdCents(c));

/**
 * SETL-DETAIL-01 (lead ROUND 14) — COMPANY WATERFALL: Invoiced − Quick Pay 0.50% − Driver −
 * Additional − Fuel − Company expenses = Net, with the signed-settlement footing.
 *
 * COMPANY-WATERFALL-FUEL-EXPENSE-SPLIT (owner 2026-09-09), CORRECTED same day: the first version of
 * this fix rendered Fuel/Company-expenses from `report` (company-settlement-scoped) alongside
 * `readout.company_settlement`'s Invoiced/Driver/Costs (TOUR-scoped — `tour-readout.routes.ts`'s
 * `company_settlement.{revenue,costs,driver_pay}_cents` are literally `totals` computed from this
 * ONE tour's own legs, not the whole company settlement, despite the field name). Mixing those two
 * scopes produced a nonsensical negative "Other costs" remainder on any company settlement covering
 * more than one driver settlement (live-caught on CS-2026-0002, 2 driver settlements: readout costs
 * $12,052.63 vs report fuel+expenses $13,398.69 — never going to reconcile, different populations).
 *
 * REAL FIX: once `report` has loaded, render the waterfall ENTIRELY from `report.sections` — the
 * exact same fields SettlementsCompanyDriverTab.tsx's own (already-correct, already-shipped) inline
 * waterfall uses: Invoiced = `revenue.invoiced_cents`, every deduction line from `pl_rollup.lines`
 * (already individually signed, no re-derivation), then Fuel Purchases + Company Expenses, then
 * NET = `pl_rollup.net_revenue_cents`. One consistent scope, nothing invented, nothing mixed.
 * Falls back to the old tour-scoped readout rendering (Invoiced/Driver/Costs as one combined line)
 * only while `report` hasn't loaded yet — never a blank card.
 *
 * STILL AN HONEST GAP (not fabricated): no read model anywhere computes a separate "Quick Pay 0.50%"
 * factoring-fee line — that would need new computation against the real per-invoice factoring
 * advance fees, not just re-plumbing an existing total, so it is deliberately not built here.
 */
export function CompanyWaterfallSection({
  readout,
  report,
}: {
  readout: TourReadout;
  report?: CompanySettlementReport;
  currencyCode?: string;
}) {
  const cs = readout.company_settlement;
  const tot = readout.totals;
  if (!cs || !tot) return null;

  if (report) {
    const invoicedCents = report.sections.revenue.invoiced_cents;
    const netCents = report.sections.pl_rollup.net_revenue_cents;
    const marginPct = invoicedCents ? (netCents / invoicedCents) * 100 : null;
    return (
      <section className="ldt-card" data-testid="settlement-company-waterfall-section">
        <div className="ldt-ch">
          <span>Company waterfall</span>
          <span className="ldt-open">{report.display_id}{report.status ? ` · ${report.status}` : ""}</span>
        </div>
        <div className="ldt-rows">
          <div className="ldt-row">
            <span>Invoiced</span>
            <span className="ldt-m" data-testid="waterfall-invoiced">{money(invoicedCents)}</span>
          </div>
          <div className="ldt-row">
            <span>
              Quick Pay (factoring fee)
              <span className="ldt-sub">not split out by the read model yet — see 5754/company-settlement-report.service.ts gap</span>
            </span>
            <span className="ldt-m ldt-muted">{DASH}</span>
          </div>
          {report.sections.pl_rollup.lines.map((line) => (
            <div className="ldt-row" key={line.line_type}>
              <span>Less · {line.label}</span>
              <span className="ldt-m">{money(line.amount_cents)}</span>
            </div>
          ))}
          <div className="ldt-row" data-testid="waterfall-fuel-purchases">
            <span>
              Less · Fuel purchases
              {report.sections.fuel_purchases.total_gallons > 0
                ? ` (${report.sections.fuel_purchases.total_gallons.toLocaleString()} gal)`
                : ""}
            </span>
            <span className="ldt-m">{money(report.sections.fuel_purchases.total_cents)}</span>
          </div>
          <div className="ldt-row" data-testid="waterfall-company-expenses">
            <span>Less · Company expenses</span>
            <span className="ldt-m">{money(report.sections.expenses.total_cents)}</span>
          </div>
          <div className="ldt-row big">
            <span>Net · {marginPct == null ? DASH : `${marginPct.toFixed(1)}%`}</span>
            <span className="ldt-m" data-testid="waterfall-net">{money(netCents)}</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ldt-card" data-testid="settlement-company-waterfall-section">
      <div className="ldt-ch">
        <span>Company waterfall</span>
        <span className="ldt-open">{cs.display_id ?? "not opened yet"}{cs.status ? ` · ${cs.status}` : ""}</span>
      </div>
      <div className="ldt-rows">
        <div className="ldt-row">
          <span>Invoiced</span>
          <span className="ldt-m" data-testid="waterfall-invoiced">{money(cs.revenue_cents)}</span>
        </div>
        <div className="ldt-row">
          <span>
            Quick Pay (factoring fee)
            <span className="ldt-sub">not split out by the read model yet — see 5754/company-settlement-report.service.ts gap</span>
          </span>
          <span className="ldt-m ldt-muted">{DASH}</span>
        </div>
        <div className="ldt-row">
          <span>Driver</span>
          <span className="ldt-m">−{money(cs.driver_pay_cents)}</span>
        </div>
        <div className="ldt-row">
          <span>
            Costs (Additional + Fuel + Company expenses)
            <span className="ldt-sub">loading the itemized company-settlement report to split this…</span>
          </span>
          <span className="ldt-m">−{money(cs.costs_cents)}</span>
        </div>
        <div className="ldt-row big">
          <span>
            Net · {tot.margin_pct == null ? DASH : `${tot.margin_pct.toFixed(1)}%`}
          </span>
          <span className="ldt-m" data-testid="waterfall-net">{money(cs.margin_cents)}</span>
        </div>
      </div>
    </section>
  );
}
