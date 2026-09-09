import { formatUsdCents } from "../../../lib/money";
import type { TourReadout } from "../../../api/tourReadout";
import type { CompanySettlementReport } from "../../../api/accounting";

const DASH = "—";
const money = (c: number | null | undefined) => (c == null ? DASH : formatUsdCents(c));

/**
 * SETL-DETAIL-01 (lead ROUND 14) — COMPANY WATERFALL: Invoiced − Quick Pay 0.50% − Driver −
 * Additional − Fuel − Company expenses = Net, with the signed-settlement footing.
 *
 * COMPANY-WATERFALL-FUEL-EXPENSE-SPLIT (owner 2026-09-09): the tour readout alone (`readout.
 * company_settlement`) only carries one combined `costs_cents` figure — that WAS the whole reason
 * this card rendered an honest "not yet split" placeholder instead of real numbers. The split
 * already exists elsewhere: company-settlement-report.service.ts (the same read model
 * SettlementsCompanyDriverTab.tsx's itemized-by-load view already consumes) computes
 * `sections.fuel_purchases`/`sections.expenses` as their own real totals. SettlementDetailPage.tsx
 * now fetches that report too (same company_settlement_id) and passes it in as `report` — when
 * present, render Fuel Purchases and Company Expenses as their own lines, plus an honest "Other
 * costs" remainder (`costs_cents − fuel − expenses`, never assumed to be zero) so the three lines
 * foot exactly to the SAME total already shown correctly today, no new GL math, nothing invented.
 * `report` is optional and this falls back to the old combined line when it hasn't loaded yet.
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

  const fuelCents = report?.sections.fuel_purchases.total_cents ?? null;
  const expensesCents = report?.sections.expenses.total_cents ?? null;
  const otherCostsCents =
    fuelCents != null && expensesCents != null ? cs.costs_cents - fuelCents - expensesCents : null;

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
        {fuelCents != null && expensesCents != null && otherCostsCents != null ? (
          <>
            <div className="ldt-row" data-testid="waterfall-fuel-purchases">
              <span>Fuel purchases</span>
              <span className="ldt-m">−{money(fuelCents)}</span>
            </div>
            <div className="ldt-row" data-testid="waterfall-company-expenses">
              <span>Company expenses</span>
              <span className="ldt-m">−{money(expensesCents)}</span>
            </div>
            <div className="ldt-row">
              <span>
                Other costs
                <span className="ldt-sub">remainder of Costs after Fuel + Company expenses (e.g. Additional pay)</span>
              </span>
              <span className="ldt-m">−{money(otherCostsCents)}</span>
            </div>
          </>
        ) : (
          <div className="ldt-row">
            <span>
              Costs (Additional + Fuel + Company expenses)
              <span className="ldt-sub">not yet split into Additional/Fuel/Company-expenses sub-lines</span>
            </span>
            <span className="ldt-m">−{money(cs.costs_cents)}</span>
          </div>
        )}
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
