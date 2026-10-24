/**
 * ROUND 443.293-A — the settlement statement is the owner's document.
 * Every figure is a company-settlement report row or a tour-readout row.
 * A column the engine does not send stays "—". Nothing here posts or re-derives GL.
 */
import type { CSSProperties, ReactNode } from "react";
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { EntityLink } from "../../../components/shared/EntityLink";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { entityLabel } from "../../../lib/entity-label";
import { formatDateUS } from "../../../lib/formatDate";
import { formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../../lib/money";

const DEDUCTION_LINE_TYPES = new Set([
  "deduction",
  "auto_deduction",
  "escrow",
  "escrow_contribution",
  "advance_recovery",
  "abandonment_chargeback",
]);

const th: CSSProperties = {
  textAlign: "center",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 8px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  fontFamily: V3.font,
};

const td: CSSProperties = {
  textAlign: "center",
  padding: `${V3_TABLE.rowPadY}px 8px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: V3_TABLE.fontPx,
  color: V3.ink,
  fontFamily: V3.font,
  whiteSpace: "nowrap",
};

function Money({ cents }: { cents: number }) {
  return <td className={QBO_MONEY_CELL_CLASS} style={td}>{formatUsdCents(cents)}</td>;
}

function Cell({ children }: { children: ReactNode }) {
  return <td style={td}>{children ?? "—"}</td>;
}

function dash(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function pctOfRevenue(amountCents: number, revenueCents: number): string {
  if (!revenueCents) return "—";
  return `${((amountCents / revenueCents) * 100).toFixed(2)}%`;
}

function dollarsPerMile(amountCents: number, miles: number): string {
  if (!miles) return "—";
  return formatUsdCents(Math.round(Math.abs(amountCents) / miles));
}

const UNLINKED = "Company settlement is not linked, so this section has no rows.";

export function SettlementStatementDocument({
  settlementNumber,
  periodStart,
  periodEnd,
  readout,
  companyReport,
}: {
  settlementNumber: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  readout: TourReadout | undefined;
  companyReport: CompanySettlementReport | undefined;
}) {
  const legs = readout?.legs ?? [];
  const sections = companyReport?.sections;
  const revenueCents = sections?.revenue.invoiced_cents ?? 0;
  const miles = sections?.miles_and_mpg.total_miles ?? 0;
  const mpg = sections?.miles_and_mpg.mpg ?? null;
  const deductionLines = (readout?.driver_settlement?.lines ?? []).filter((line) =>
    DEDUCTION_LINE_TYPES.has(line.line_type),
  );
  const start = companyReport?.period_start ?? periodStart;
  const end = companyReport?.period_end ?? periodEnd;
  const number = (companyReport?.display_id || settlementNumber || "").trim();

  return (
    <div data-testid="settlement-statement-document" data-settlement-document="1" className="space-y-2">
      <V3Panel title="Header" testId="settlement-document-header">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Settlement no.</th>
              <th style={th}>Start date</th>
              <th style={th}>End date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell>{number || "—"}</Cell>
              <Cell>{start ? formatDateUS(start) : "—"}</Cell>
              <Cell>{end ? formatDateUS(end) : "—"}</Cell>
            </tr>
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Loads" testId="settlement-document-loads">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Pickup</th>
              <th style={th}>Delivery</th>
              <th style={th}>Truck</th>
              <th style={th}>Trailer</th>
            </tr>
          </thead>
          <tbody>
            {legs.length === 0 ? (
              <tr><td style={td} colSpan={5}>No loads on this tour.</td></tr>
            ) : (
              legs.map((leg) => (
                <tr key={leg.load_id}>
                  <td style={td}>
                    <EntityLink kind="load" id={leg.load_id} label={entityLabel(leg.load_number, leg.load_id, "Load")} />
                  </td>
                  <Cell>{[leg.pickup_date ? formatDateUS(leg.pickup_date) : null, leg.pickup_city].filter(Boolean).join(" · ") || "—"}</Cell>
                  <Cell>{[leg.delivery_date ? formatDateUS(leg.delivery_date) : null, leg.delivery_city].filter(Boolean).join(" · ") || "—"}</Cell>
                  <Cell>{leg.unit_number}</Cell>
                  <Cell>{leg.trailer_number}</Cell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Customer charges" testId="settlement-document-charges">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Item</th>
              <th style={th}>Description</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!sections ? (
              <tr><td style={td} colSpan={4}>{UNLINKED}</td></tr>
            ) : sections.customer_charges.rows.length === 0 ? (
              <tr><td style={td} colSpan={4}>No customer charges on this settlement.</td></tr>
            ) : (
              sections.customer_charges.rows.map((row, index) => (
                <tr key={`${row.load_id}-${row.charge_code}-${index}`}>
                  <Cell>{row.load_number}</Cell>
                  <Cell>{row.charge_code}</Cell>
                  <Cell>{row.description}</Cell>
                  <Money cents={row.amount_cents} />
                </tr>
              ))
            )}
            {sections ? (
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total line haul</td>
                <Money cents={sections.customer_charges.total_cents} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Driver payment" testId="settlement-document-driver-pay">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Driver</th>
              <th style={th}>Line</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!sections ? (
              <tr><td style={td} colSpan={4}>{UNLINKED}</td></tr>
            ) : sections.driver_payment.rows.length === 0 ? (
              <tr><td style={td} colSpan={4}>No driver payment lines on this settlement.</td></tr>
            ) : (
              sections.driver_payment.rows.map((row, index) => (
                <tr key={`${row.load_id ?? "none"}-${row.line_type}-${index}`}>
                  <Cell>{row.load_number}</Cell>
                  <Cell>{row.driver_name}</Cell>
                  <Cell>{row.description || row.line_type}</Cell>
                  <Money cents={row.amount_cents} />
                </tr>
              ))
            )}
            {sections ? (
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total driver payment</td>
                <Money cents={sections.driver_payment.total_cents} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Fuel purchases" testId="settlement-document-fuel">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Vendor</th>
              <th style={th}>Location</th>
              <th style={th}>Invoice</th>
              <th style={th}>Gallons</th>
              <th style={th}>CPG</th>
              <th style={th}>Actual</th>
            </tr>
          </thead>
          <tbody>
            {!sections ? (
              <tr><td style={td} colSpan={7}>{UNLINKED}</td></tr>
            ) : sections.fuel_purchases.rows.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>
                  {sections.fuel_purchases.total_cents > 0
                    ? `Fuel total ${formatUsdCents(sections.fuel_purchases.total_cents)} is on the report. Fill lines are not listed.`
                    : "No fuel purchases on this settlement."}
                </td>
              </tr>
            ) : (
              sections.fuel_purchases.rows.map((row, index) => (
                <tr key={`${row.invoice_number ?? "fuel"}-${index}`}>
                  <Cell>{row.transaction_date ? formatDateUS(row.transaction_date) : "—"}</Cell>
                  <Cell>{row.vendor}</Cell>
                  <Cell>{row.location}</Cell>
                  <Cell>{row.invoice_number}</Cell>
                  <Cell>{row.gallons == null ? "—" : row.gallons.toLocaleString("en-US", { maximumFractionDigits: 3 })}</Cell>
                  <Cell>{row.price_per_gallon == null ? "—" : row.price_per_gallon.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</Cell>
                  <Money cents={row.amount_cents} />
                </tr>
              ))
            )}
            {sections && sections.fuel_purchases.rows.length > 0 ? (
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total fuel</td>
                <Cell>{sections.fuel_purchases.total_gallons.toLocaleString("en-US", { maximumFractionDigits: 3 })}</Cell>
                <td style={td} />
                <Money cents={sections.fuel_purchases.total_cents} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Expenses" testId="settlement-document-expenses">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Vendor</th>
              <th style={th}>Description</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!sections ? (
              <tr><td style={td} colSpan={4}>{UNLINKED}</td></tr>
            ) : sections.expenses.rows.length === 0 ? (
              <tr><td style={td} colSpan={4}>No expenses on this settlement.</td></tr>
            ) : (
              sections.expenses.rows.map((row, index) => (
                <tr key={`${row.load_id ?? "exp"}-${index}`}>
                  <Cell>{row.load_number}</Cell>
                  <Cell>{row.vendor}</Cell>
                  <Cell>{row.description}</Cell>
                  <Money cents={row.amount_cents} />
                </tr>
              ))
            )}
            {sections ? (
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={3}>Total expenses</td>
                <Money cents={sections.expenses.total_cents} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Deductions" testId="settlement-document-deductions">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Line</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {deductionLines.length === 0 ? (
              <tr><td style={td} colSpan={3}>No deductions on this settlement.</td></tr>
            ) : (
              deductionLines.map((line) => (
                <tr key={line.id}>
                  <td style={td}>
                    {line.load_id ? (
                      <EntityLink kind="load" id={line.load_id} label={entityLabel(line.load_number, line.load_id, "Load")} />
                    ) : (
                      dash(line.load_number)
                    )}
                  </td>
                  <Cell>{line.description || line.line_type}</Cell>
                  <Money cents={line.amount_cents} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Revenue" testId="settlement-document-revenue">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Line</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Cell>Invoiced</Cell>
              <Money cents={revenueCents} />
            </tr>
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Profit and loss" testId="settlement-document-pl">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Line</th>
              <th style={th}>% of revenue</th>
              <th style={th}>$ / mile</th>
              <th style={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {!sections ? (
              <tr><td style={td} colSpan={4}>{UNLINKED}</td></tr>
            ) : (
              <>
                {sections.pl_rollup.lines.map((line) => (
                  <tr key={line.line_type}>
                    <Cell>{line.label}</Cell>
                    <Cell>{pctOfRevenue(line.amount_cents, revenueCents)}</Cell>
                    <Cell>{dollarsPerMile(line.amount_cents, miles)}</Cell>
                    <Money cents={line.amount_cents} />
                  </tr>
                ))}
                <tr>
                  <td style={{ ...td, fontWeight: 700 }}>Net revenue</td>
                  <Cell>{pctOfRevenue(sections.pl_rollup.net_revenue_cents, revenueCents)}</Cell>
                  <Cell>{dollarsPerMile(sections.pl_rollup.net_revenue_cents, miles)}</Cell>
                  <Money cents={sections.pl_rollup.net_revenue_cents} />
                </tr>
                <tr>
                  <Cell>Miles</Cell>
                  <td style={td} colSpan={3}>{miles ? miles.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}</td>
                </tr>
                <tr>
                  <Cell>M.P.G.</Cell>
                  <td style={td} colSpan={3}>{mpg == null ? "—" : mpg.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </V3Panel>
    </div>
  );
}
