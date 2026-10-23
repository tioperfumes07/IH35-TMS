/**
 * ROUND 443.274-C Settlements-Statement.dc.html — board 2×2 panels.
 * Numbers from getSettlement lines + getTourReadout + getCompanySettlementReport only.
 * Measured callouts on the board are design annotations, not UI.
 */
import type { CSSProperties, ReactNode } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { formatUsd, formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../../lib/money";
import { entityLabel } from "../../../lib/entity-label";
import { openCanonicalDocument } from "../../../lib/openPrintableDocument";
import type { TourReadout } from "../../../api/tourReadout";
import type { CompanySettlementReport } from "../../../api/accounting";

export type StatementEarningsRow = {
  id: string;
  load_id: string | null;
  load_number: string | null;
  origin_city: string | null;
  origin_state: string | null;
  dest_city: string | null;
  dest_state: string | null;
  miles: number | undefined;
  rate: number | undefined;
  amount: number;
};

const th: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  fontFamily: V3.font,
};

const td: CSSProperties = {
  textAlign: "left",
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  fontSize: V3_TABLE.fontPx,
  color: V3.ink,
  fontFamily: V3.font,
  whiteSpace: "nowrap",
};

const tdRight: CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };
const thRight: CSSProperties = { ...th, textAlign: "right" };

function MoneyTd({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <td className={QBO_MONEY_CELL_CLASS} style={{ ...tdRight, ...style }}>
      {children}
    </td>
  );
}

function laneLabel(row: StatementEarningsRow): string {
  const o = [row.origin_city, row.origin_state].filter(Boolean).join(", ");
  const d = [row.dest_city, row.dest_state].filter(Boolean).join(", ");
  if (o && d) return `${o} → ${d}`;
  return o || d || "—";
}

function fmtMiles(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
}

function fmtRate(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function LinkCell({ children }: { children: ReactNode }) {
  return <span style={{ color: V3.link, fontWeight: 600 }}>{children}</span>;
}

export function SettlementStatementBoardPanels({
  settlementId,
  companyId,
  settlementDisplayId,
  earnings,
  deductionTotalDollars,
  reimbursementTotalDollars,
  driverNetCents,
  readout,
  companyReport,
  matchedBankTransactionId,
  onOpenJournalEntry,
}: {
  settlementId: string;
  companyId: string;
  settlementDisplayId: string | null;
  earnings: StatementEarningsRow[];
  deductionTotalDollars: number;
  reimbursementTotalDollars: number;
  driverNetCents: number;
  readout: TourReadout | undefined;
  companyReport: CompanySettlementReport | undefined;
  matchedBankTransactionId: string | null;
  onOpenJournalEntry: () => void;
}) {
  const grossMiles = earnings.reduce((s, r) => s + (r.miles ?? 0), 0);
  const grossPayDollars = earnings.reduce((s, r) => s + r.amount, 0);

  const csDisplayId = (
    readout?.company_settlement?.display_id ??
    companyReport?.display_id ??
    settlementDisplayId ??
    ""
  ).trim();
  const companyPanelTitle = csDisplayId
    ? `Company settlement ${csDisplayId} — side by side`
    : "Company settlement — side by side";

  const revenueCents =
    companyReport?.sections.revenue.invoiced_cents ?? readout?.company_settlement?.revenue_cents ?? 0;
  const fuelCents = companyReport?.sections.fuel_purchases.total_cents ?? 0;
  const expenseCents = companyReport?.sections.expenses.total_cents ?? 0;
  const costsCents =
    companyReport != null
      ? fuelCents + expenseCents
      : (readout?.company_settlement?.costs_cents ?? 0);
  const driverPayCents =
    companyReport?.sections.driver_payment.total_cents ??
    readout?.company_settlement?.driver_pay_cents ??
    readout?.driver_settlement?.gross_cents ??
    0;
  const marginCents =
    companyReport?.sections.pl_rollup.net_revenue_cents ??
    readout?.company_settlement?.margin_cents ??
    revenueCents - costsCents - driverPayCents;

  const fuelFillCount = companyReport?.sections.fuel_purchases.rows.length ?? 0;
  const recoveriesCents = readout?.driver_settlement?.recoveries_cents ?? 0;
  const pdfPath = readout?.driver_settlement?.pdf_path?.trim() || "";
  const hasSignedPdf = Boolean(pdfPath) || Boolean(settlementDisplayId);

  const legs = readout?.legs ?? [];

  return (
    <div
      data-testid="settlements-statement-v3-panel"
      data-settlements-statement-v3-panel="1"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, marginBottom: 12 }}
    >
      <V3Panel title="Earnings — by load" testId="settlement-statement-panel-earnings">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Load</th>
              <th style={th}>Lane</th>
              <th style={thRight}>Miles (doc)</th>
              <th style={thRight}>Rate</th>
              <th style={thRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {earnings.length === 0 ? (
              <tr>
                <td style={td} colSpan={5}>
                  —
                </td>
              </tr>
            ) : (
              earnings.map((row) => (
                <tr key={row.id}>
                  <td style={td}>
                    {row.load_id ? (
                      <EntityLink
                        kind="load"
                        id={row.load_id}
                        label={entityLabel(row.load_number, row.load_id, "Load")}
                      />
                    ) : (
                      row.load_number ?? "—"
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 220 }}>{laneLabel(row)}</td>
                  <td style={tdRight}>{fmtMiles(row.miles)}</td>
                  <td style={tdRight}>{fmtRate(row.rate)}</td>
                  <MoneyTd>{formatUsd(row.amount)}</MoneyTd>
                </tr>
              ))
            )}
            <tr>
              <td style={{ ...td, fontWeight: 700, borderBottom: "none" }} colSpan={2}>
                Gross pay
              </td>
              <td style={{ ...tdRight, fontWeight: 700, borderBottom: "none" }}>{fmtMiles(grossMiles)}</td>
              <td style={{ ...tdRight, borderBottom: "none" }}>{""}</td>
              <MoneyTd style={{ fontWeight: 700, borderBottom: "none" }}>{formatUsd(grossPayDollars)}</MoneyTd>
            </tr>
          </tbody>
        </table>
      </V3Panel>

      <V3Panel title="Deductions · reimbursements · net" testId="settlement-statement-panel-deductions">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Item</th>
              <th style={thRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>Deductions (escrow, advances, fines)</td>
              <MoneyTd style={{ color: deductionTotalDollars > 0 ? V3.red : V3.ink }}>
                {deductionTotalDollars > 0 ? `−${formatUsd(deductionTotalDollars)}` : formatUsd(0)}
              </MoneyTd>
            </tr>
            <tr>
              <td style={td}>Reimbursements (tolls, scales)</td>
              <MoneyTd style={{ color: reimbursementTotalDollars > 0 ? V3.green : V3.ink }}>
                {reimbursementTotalDollars > 0 ? `+${formatUsd(reimbursementTotalDollars)}` : formatUsd(0)}
              </MoneyTd>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, borderBottom: "none" }}>Driver net</td>
              <MoneyTd style={{ fontWeight: 700, borderBottom: "none" }}>{formatUsdCents(driverNetCents)}</MoneyTd>
            </tr>
          </tbody>
        </table>
      </V3Panel>

      <V3Panel
        title={companyPanelTitle}
        testId="settlement-statement-panel-company"
        footer="Revenue − costs − driver pay = margin. Same tour, same loads."
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Line</th>
              <th style={thRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>Revenue</td>
              <MoneyTd>{formatUsdCents(revenueCents)}</MoneyTd>
            </tr>
            <tr>
              <td style={td}>Costs (fuel, tolls, other)</td>
              <MoneyTd style={{ color: costsCents > 0 ? V3.red : V3.ink }}>
                {costsCents > 0 ? `−${formatUsdCents(costsCents)}` : formatUsdCents(0)}
              </MoneyTd>
            </tr>
            <tr>
              <td style={td}>Driver pay</td>
              <MoneyTd style={{ color: driverPayCents > 0 ? V3.red : V3.ink }}>
                {driverPayCents > 0 ? `−${formatUsdCents(driverPayCents)}` : formatUsdCents(0)}
              </MoneyTd>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700, borderBottom: "none" }}>Margin</td>
              <MoneyTd style={{ fontWeight: 700, borderBottom: "none" }}>{formatUsdCents(marginCents)}</MoneyTd>
            </tr>
          </tbody>
        </table>
      </V3Panel>

      <V3Panel
        title="Linked records"
        testId="settlement-statement-panel-linked"
        footer="Every link opens its record and comes back here (two-way)."
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Record</th>
              <th style={th}>Link</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>Loads</td>
              <td style={{ ...td, whiteSpace: "normal" }}>
                {legs.length === 0 ? (
                  "—"
                ) : (
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {legs.map((leg, i) => (
                      <span key={leg.load_id}>
                        <EntityLink
                          kind="load"
                          id={leg.load_id}
                          label={entityLabel(leg.load_number, leg.load_id, "Load")}
                        />
                        {i < legs.length - 1 ? <span style={{ color: V3.muted }}> · </span> : null}
                      </span>
                    ))}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td style={td}>Fuel fills on this tour</td>
              <td style={td}>
                {fuelFillCount > 0 ? (
                  <LinkCell>
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .querySelector("[data-testid='fuel-purchases-section'], #settlement-statement-fuel")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: V3.link,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: V3.font,
                        fontSize: V3_TABLE.fontPx,
                      }}
                    >
                      {fuelFillCount} fill{fuelFillCount === 1 ? "" : "s"} →
                    </button>
                  </LinkCell>
                ) : (
                  "—"
                )}
              </td>
            </tr>
            <tr>
              <td style={td}>Advances recovered</td>
              <MoneyTd>{recoveriesCents > 0 ? formatUsdCents(recoveriesCents) : "—"}</MoneyTd>
            </tr>
            <tr>
              <td style={td}>Bank payment</td>
              <td style={td}>
                {matchedBankTransactionId ? (
                  <EntityLink
                    kind="bank_transaction"
                    id={matchedBankTransactionId}
                    label="Bank line →"
                  />
                ) : (
                  "—"
                )}
              </td>
            </tr>
            <tr>
              <td style={td}>Journal entry</td>
              <td style={td}>
                <LinkCell>
                  <button
                    type="button"
                    onClick={onOpenJournalEntry}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      color: V3.link,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: V3.font,
                      fontSize: V3_TABLE.fontPx,
                    }}
                  >
                    JE →
                  </button>
                </LinkCell>
              </td>
            </tr>
            <tr>
              <td style={{ ...td, borderBottom: "none" }}>Signed document</td>
              <td style={{ ...td, borderBottom: "none" }}>
                {hasSignedPdf ? (
                  <LinkCell>
                    <button
                      type="button"
                      onClick={() =>
                        openCanonicalDocument(
                          pdfPath ||
                            `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`
                        )
                      }
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: V3.link,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: V3.font,
                        fontSize: V3_TABLE.fontPx,
                      }}
                    >
                      {settlementDisplayId ? `${settlementDisplayId}.pdf →` : "Statement PDF →"}
                    </button>
                  </LinkCell>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </V3Panel>
    </div>
  );
}
