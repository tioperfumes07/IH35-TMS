// TABLE_DATE_OMIT: this table has no date column by design — one row per KIND of record linked to this statement (loads / fuel fills / advances recovered / bank payment / journal entry / signed document), each a two-way link; the dates live on the linked records.
import type { CSSProperties, ReactNode } from "react";
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { EntityLink } from "../../../components/shared/EntityLink";
import { MoneyCell } from "../../../components/shared/MoneyCell";
import { ParityTable } from "../../../components/parity/ParityTable";
import { BoardSection } from "../../../components/v3/BoardSection";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { entityLabel } from "../../../lib/entity-label";
import { formatUsdCents } from "../../../lib/money";
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

type LinkedRow = { id: string; record: string; link: ReactNode };

const LINK_BUTTON_STYLE: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  color: V3.link,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: V3.font,
  fontSize: V3_TABLE.fontPx,
};

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
  // Codex cert: Advances recovered = advance_recovery / pay-run recoveries only — never lumped
  // recoveries_cents (admin-fee deductions / fuel overage / damage).
  const advanceRecoveriesCents = readout?.driver_settlement?.advance_recoveries_cents ?? 0;
  const advanceSourceIds = readout?.driver_settlement?.advance_source_ids ?? [];
  const pdfPath = readout?.driver_settlement?.pdf_path?.trim() || "";
  const hasSignedPdf = Boolean(pdfPath) || Boolean(settlementDisplayId);
  const legs = readout?.legs ?? [];

  const linkedRows: LinkedRow[] = [
    {
      id: "loads",
      record: L.rowLoads,
      link:
        legs.length === 0 ? (
          "—"
        ) : (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {legs.map((leg, i) => (
              <span key={leg.load_id}>
                <EntityLink kind="load" id={leg.load_id} label={entityLabel(leg.load_number, leg.load_id, "Load")} />
                {i < legs.length - 1 ? <span style={{ color: V3.muted }}> · </span> : null}
              </span>
            ))}
          </span>
        ),
    },
    {
      id: "fuel",
      record: L.rowFuel,
      link:
        fuelFillCount > 0 ? (
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
              style={LINK_BUTTON_STYLE}
            >
              {`${fuelFillCount} fill${fuelFillCount === 1 ? "" : "s"} →`}
            </button>
          </LinkCell>
        ) : (
          "—"
        ),
    },
    {
      id: "advances",
      record: L.rowAdvances,
      link:
        advanceRecoveriesCents > 0 || advanceSourceIds.length > 0 ? (
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
              fontVariantNumeric: "tabular-nums",
            }}
            data-testid="statement-advances-recovered"
          >
            {advanceSourceIds.length === 1 ? (
              <MoneyCell
                cents={advanceRecoveriesCents > 0 ? advanceRecoveriesCents : null}
                drill={{ entity: { kind: "cash_advance", id: advanceSourceIds[0] } }}
              />
            ) : advanceSourceIds.length > 1 ? (
              <>
                {/* Total is the sum of the cash-advance links below — each opens its source. */}
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {advanceRecoveriesCents > 0 ? formatUsdCents(advanceRecoveriesCents) : "—"}
                </span>
                {advanceSourceIds.map((id) => (
                  <EntityLink key={id} kind="cash_advance" id={id} label={entityLabel(null, id, "Advance")} />
                ))}
              </>
            ) : (
              <span
                style={{ fontVariantNumeric: "tabular-nums" }}
                title="Advance recovery amount with no source advance id stamped"
              >
                {advanceRecoveriesCents > 0 ? formatUsdCents(advanceRecoveriesCents) : "—"}
              </span>
            )}
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "bank",
      record: L.rowBank,
      link: matchedBankTransactionId ? (
        <EntityLink kind="bank_transaction" id={matchedBankTransactionId} label={L.rowBankLabel} />
      ) : (
        "—"
      ),
    },
    {
      id: "journal",
      record: L.rowJE,
      link: (
        <LinkCell>
          <button type="button" onClick={onOpenJournalEntry} style={LINK_BUTTON_STYLE}>
            {L.rowJELabel}
          </button>
        </LinkCell>
      ),
    },
    {
      id: "signed",
      record: L.rowSigned,
      link: hasSignedPdf ? (
        <LinkCell>
          <button
            type="button"
            onClick={() =>
              openCanonicalDocument(
                pdfPath ||
                  `/api/v1/driver-finance/settlements/${encodeURIComponent(settlementId)}.html?operating_company_id=${encodeURIComponent(companyId)}`
              )
            }
            style={LINK_BUTTON_STYLE}
          >
            {settlementDisplayId ? `${settlementDisplayId}.pdf →` : L.rowSignedPdf}
          </button>
        </LinkCell>
      ) : (
        "—"
      ),
    },
  ];

  return (
    <BoardSection
      title={L.panelTitle}
      testId="settlement-statement-panel-linked"
      footer={L.panelFooter}
    >
      <ParityTable<LinkedRow> appearance="board"
        tableTestId="settlement-statement-linked-table"
        hidePager
        density="compact"
        suppressToolbarSearch
        suppressToolbarRange
        rows={linkedRows}
        rowKey={(row) => row.id}
        rowTestId={(row) => `settlement-statement-linked-${row.id}`}
        emptyText="No linked records."
        columns={[
          { key: "record", label: L.colRecord, sortable: true, sortValue: (row) => row.record, render: (row) => row.record },
          { key: "link", label: L.colLink, sortable: false, allowWrap: true, render: (row) => row.link },
        ]}
      />
    </BoardSection>
  );
}
