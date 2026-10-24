import type { CSSProperties, ReactNode } from "react";
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { entityLabel } from "../../../lib/entity-label";
import { openCanonicalDocument } from "../../../lib/openPrintableDocument";

const L = {
  panelTitle: "Linked records",
  panelFooter: "Every link opens its record and comes back here (two-way).",
  colRecord: "Record",
  colLink: "Link",
  rowLoads: "Loads",
  rowFuel: "Fuel fills on this tour",
  rowAdvances: "Advances recovered",
  rowBank: "Bank payment",
  rowBankLabel: "Bank line →",
  rowJE: "Journal entry",
  rowJELabel: "JE →",
  rowSigned: "Signed document",
  rowSignedPdf: "Statement PDF →",
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

function LinkCell({ children }: { children: ReactNode }) {
  return <span style={{ color: V3.link, fontWeight: 600 }}>{children}</span>;
}

export function SettlementStatementLinkedRecordsPanel({
  settlementId,
  companyId,
  settlementDisplayId,
  readout,
  companyReport,
  matchedBankTransactionId,
  onOpenJournalEntry,
  onOpenFuelFills,
}: {
  settlementId: string;
  companyId: string;
  settlementDisplayId: string | null;
  readout: TourReadout | undefined;
  companyReport: CompanySettlementReport | undefined;
  matchedBankTransactionId: string | null;
  onOpenJournalEntry: () => void;
  onOpenFuelFills?: () => void;
}) {
  const fuelFillCount = companyReport?.sections.fuel_purchases.rows.length ?? 0;
  const recoveriesCents = readout?.driver_settlement?.recoveries_cents ?? 0;
  const pdfPath = readout?.driver_settlement?.pdf_path?.trim() || "";
  const hasSignedPdf = Boolean(pdfPath) || Boolean(settlementDisplayId);
  const legs = readout?.legs ?? [];

  return (
    <V3Panel
      title={L.panelTitle}
      testId="settlement-statement-panel-linked"
      footer={L.panelFooter}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>{L.colRecord}</th>
            <th style={th}>{L.colLink}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>{L.rowLoads}</td>
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
            <td style={td}>{L.rowFuel}</td>
            <td style={td}>
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
                    {`${fuelFillCount} fill${fuelFillCount === 1 ? "" : "s"} →`}
                  </button>
                </LinkCell>
              ) : (
                "—"
              )}
            </td>
          </tr>
          <tr>
            <td style={td}>{L.rowAdvances}</td>
            <td style={tdRight}>
              <MoneyCell
                cents={recoveriesCents > 0 ? recoveriesCents : null}
                drill={{ entity: { kind: "settlement", id: settlementId } }}
              />
            </td>
          </tr>
          <tr>
            <td style={td}>{L.rowBank}</td>
            <td style={td}>
              {matchedBankTransactionId ? (
                <EntityLink kind="bank_transaction" id={matchedBankTransactionId} label={L.rowBankLabel} />
              ) : (
                "—"
              )}
            </td>
          </tr>
          <tr>
            <td style={td}>{L.rowJE}</td>
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
                  {L.rowJELabel}
                </button>
              </LinkCell>
            </td>
          </tr>
          <tr>
            <td style={{ ...td, borderBottom: "none" }}>{L.rowSigned}</td>
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
                    {settlementDisplayId ? `${settlementDisplayId}.pdf →` : L.rowSignedPdf}
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
  );
}
