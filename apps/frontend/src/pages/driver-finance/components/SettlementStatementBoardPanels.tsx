/**
 * ROUND 443.274-C Settlements-Statement.dc.html — board 2×2 panels.
 * Numbers from getSettlement lines + getTourReadout + getCompanySettlementReport only.
 * Measured callouts on the board are design annotations, not UI.
 */
import type { CSSProperties, ReactNode } from "react";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { formatQuantityTable, formatUsd, formatUsdCents } from "../../../lib/money";
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

function laneLabel(row: StatementEarningsRow): string {
  const o = [row.origin_city, row.origin_state].filter(Boolean).join(", ");
  const d = [row.dest_city, row.dest_state].filter(Boolean).join(", ");
  if (o && d) return `${o} → ${d}`;
  return o || d || "—";
}

function fmtMiles(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return formatQuantityTable(n, 1, 0);
}

function fmtRate(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return formatQuantityTable(n, 4);
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
  onOpenFuelFills,
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
  /** 443.280-A — fuel fills live on Settlement workflow, not under the board. */
  onOpenFuelFills?: () => void;
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
  const advanceRecoveriesCents = readout?.driver_settlement?.advance_recoveries_cents ?? 0;
  const advanceSourceIds = readout?.driver_settlement?.advance_source_ids ?? [];
  const pdfPath = readout?.driver_settlement?.pdf_path?.trim() || "";
  const hasSignedPdf = Boolean(pdfPath) || Boolean(settlementDisplayId);

  const legs = readout?.legs ?? [];
  const dollarsAsCentsFormat = (c: number) => formatUsd(c / 100);
  const signedMinusCents = (c: number) => (c > 0 ? `−${formatUsdCents(c)}` : formatUsdCents(0));
  const signedMinusDollars = (c: number) => (c > 0 ? `−${formatUsd(c / 100)}` : formatUsd(0));
  const signedPlusDollars = (c: number) => (c > 0 ? `+${formatUsd(c / 100)}` : formatUsd(0));


  function MoneyRowValue({
    cents,
    format,
    loadId,
    style,
  }: {
    cents: number | null | undefined;
    format?: (c: number) => string;
    loadId?: string | null;
    style?: CSSProperties;
  }) {
    return (
      <span style={style}>
        {loadId ? (
          <MoneyCell
            cents={cents}
            format={format}
            drill={{ entity: { kind: "load", id: loadId } }}
          />
        ) : (
          <MoneyCell
            cents={cents}
            format={format}
            drill={{ entity: { kind: "settlement", id: settlementId } }}
          />
        )}
      </span>
    );
  }

  const kvRow: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: `${V3_TABLE.rowPadY}px 12px`,
    borderBottom: `1px solid ${V3.borderSoft}`,
    fontSize: V3_TABLE.fontPx,
    color: V3.ink,
    fontFamily: V3.font,
  };
  return (
    <div
      data-testid="settlements-statement-v3-panel"
      data-settlements-statement-v3-panel="1"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10, marginBottom: 12 }}
    >
      <BoardSection title="Earnings — by load" testId="settlement-statement-panel-earnings">
        <ParityTable
          appearance="board"
          title="Earnings — by load"
          columns={
            [
              {
                key: "load",
                label: "Load",
                render: (row) =>
                  row.load_id ? (
                    <EntityLink
                      kind="load"
                      id={row.load_id}
                      label={entityLabel(row.load_number, row.load_id, "Load")}
                    />
                  ) : (
                    row.load_number ?? "—"
                  ),
              },
              {
                key: "lane",
                label: "Lane",
                render: (row) => <span className="whitespace-normal">{laneLabel(row)}</span>,
              },
              {
                key: "miles",
                label: "Miles (doc)",
                cellClass: "text-right",
                render: (row) => fmtMiles(row.miles),
              },
              {
                key: "rate",
                label: "Rate",
                cellClass: "text-right",
                render: (row) => fmtRate(row.rate),
              },
              {
                key: "amount",
                label: "Amount",
                cellClass: "text-right",
                render: (row) => (
                  <MoneyCell
                    cents={Math.round(row.amount * 100)}
                    format={dollarsAsCentsFormat}
                    drill={
                      row.load_id
                        ? { entity: { kind: "load", id: row.load_id } }
                        : { entity: { kind: "settlement", id: settlementId } }
                    }
                  />
                ),
              },
            ] satisfies ParityColumn<StatementEarningsRow>[]
          }
          rows={earnings}
          rowKey={(row) => row.id}
          emptyText="—"
          storageKey="settlement-statement-earnings-panel"
          tableTestId="settlement-statement-earnings-table"
          suppressToolbarSearch
          suppressToolbarRange
          footerCells={{
            load: "Gross pay",
            miles: fmtMiles(grossMiles),
            amount: (
              <MoneyCell
                cents={Math.round(grossPayDollars * 100)}
                format={dollarsAsCentsFormat}
                drill={{ entity: { kind: "settlement", id: settlementId } }}
              />
            ),
          }}
        />
      </BoardSection>

      <BoardSection title="Deductions · reimbursements · net" testId="settlement-statement-panel-deductions">
        <dl data-testid="settlement-statement-deductions-kv">
          <div style={kvRow}>
            <dt>Deductions (escrow, advances, fines)</dt>
            <dd>
              <MoneyRowValue
                cents={Math.round(deductionTotalDollars * 100)}
                format={signedMinusDollars}
                style={{ color: deductionTotalDollars > 0 ? V3.red : V3.ink }}
              />
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Reimbursements (tolls, scales)</dt>
            <dd>
              <MoneyRowValue
                cents={Math.round(reimbursementTotalDollars * 100)}
                format={signedPlusDollars}
                style={{ color: reimbursementTotalDollars > 0 ? V3.green : V3.ink }}
              />
            </dd>
          </div>
          <div style={{ ...kvRow, fontWeight: 700, borderBottom: "none" }}>
            <dt>Driver net</dt>
            <dd>
              <MoneyRowValue cents={driverNetCents} style={{ fontWeight: 700 }} />
            </dd>
          </div>
        </dl>
      </BoardSection>

      <BoardSection
        title={companyPanelTitle}
        testId="settlement-statement-panel-company"
        footer="Revenue − costs − driver pay = margin. Same tour, same loads."
      >
        <dl data-testid="settlement-statement-company-kv">
          <div style={kvRow}>
            <dt>Revenue</dt>
            <dd>
              <MoneyRowValue cents={revenueCents} />
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Costs (fuel, tolls, other)</dt>
            <dd>
              <MoneyRowValue
                cents={costsCents}
                format={signedMinusCents}
                style={{ color: costsCents > 0 ? V3.red : V3.ink }}
              />
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Driver pay</dt>
            <dd>
              <MoneyRowValue
                cents={driverPayCents}
                format={signedMinusCents}
                style={{ color: driverPayCents > 0 ? V3.red : V3.ink }}
              />
            </dd>
          </div>
          <div style={{ ...kvRow, fontWeight: 700, borderBottom: "none" }}>
            <dt>Margin</dt>
            <dd>
              <MoneyRowValue cents={marginCents} style={{ fontWeight: 700 }} />
            </dd>
          </div>
        </dl>
      </BoardSection>

      <BoardSection
        title="Linked records"
        testId="settlement-statement-panel-linked"
        footer="Every link opens its record and comes back here (two-way)."
      >
        <dl data-testid="settlement-statement-linked-kv">
          <div style={{ ...kvRow, alignItems: "flex-start" }}>
            <dt>Loads</dt>
            <dd style={{ whiteSpace: "normal", textAlign: "right" }}>
              {legs.length === 0 ? (
                "—"
              ) : (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
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
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Fuel fills on this tour</dt>
            <dd>
              {fuelFillCount > 0 ? (
                <LinkCell>
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenFuelFills) {
                        onOpenFuelFills();
                        return;
                      }
                      document
                        .querySelector("[data-testid='fuel-purchases-section'], #settlement-statement-fuel")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
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
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Advances recovered</dt>
            <dd data-testid="statement-board-advances-recovered">
              {advanceRecoveriesCents > 0 || advanceSourceIds.length > 0 ? (
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <MoneyCell
                    cents={advanceRecoveriesCents > 0 ? advanceRecoveriesCents : null}
                    drill={
                      advanceSourceIds.length === 1
                        ? { entity: { kind: "cash_advance", id: advanceSourceIds[0] } }
                        : advanceSourceIds.length === 0
                          ? { none: "advance recovery amount with no source advance id stamped" }
                          : { none: "multiple advances recovered — open each link below" }
                    }
                  />
                  {advanceSourceIds.length > 1
                    ? advanceSourceIds.map((id) => (
                        <EntityLink key={id} kind="cash_advance" id={id} label={entityLabel(null, id, "Advance")} />
                      ))
                    : null}
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Bank payment</dt>
            <dd>
              {matchedBankTransactionId ? (
                <EntityLink kind="bank_transaction" id={matchedBankTransactionId} label="Bank line →" />
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div style={kvRow}>
            <dt>Journal entry</dt>
            <dd>
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
            </dd>
          </div>
          <div style={{ ...kvRow, borderBottom: "none" }}>
            <dt>Signed document</dt>
            <dd>
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
            </dd>
          </div>
        </dl>
      </BoardSection>
    </div>
  );
}
