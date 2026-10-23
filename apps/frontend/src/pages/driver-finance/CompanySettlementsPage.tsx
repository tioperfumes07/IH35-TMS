// ROUND 443.274-C Settlements-Company.dc.html — per-tour table (closed tours):
// Company settlement · Driver settlement · Driver · Revenue · Costs · Driver pay · Margin · Margin %.
// Engines: listTours("closed") / TourListRow (same readout as Settlements Open/Closed).
// "not opened" amber when company_settlement_id is null; "No number" red when AlwaysTrack missing.
// Deep link ?id=<company_settlement_id> still opens the 8-section waterfall (unchanged engine).
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { V3Panel } from "../../components/v3/V3Panel";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  listCompanySettlements,
  getCompanySettlementReport,
  companySettlementHtmlUrl,
  type CompanySettlementListRow,
} from "../../api/accounting";
import { listTours, type TourListRow } from "../../api/tourReadout";
import { openPrintableDocument, openCanonicalDocument } from "../../lib/openPrintableDocument";
import { formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../lib/money";
import { mmmDd } from "../../lib/formatDate";
import { settlementNumber } from "../../lib/settlementNumber";
import { CompanySettlementItemizedByLoad } from "./components/CompanySettlementItemizedByLoad";
import { SETTLEMENTS_SUBNAV } from "./settlementsSubnav";

const DASH = "—";
function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return DASH;
  return formatUsdCents(cents);
}
function date(value: string | null | undefined): string {
  const out = mmmDd(value ?? "");
  return out || DASH;
}

/** Driver settlement label — AlwaysTrack doc, else "No number" (closed board). */
function driverSettlementLabel(r: TourListRow): string {
  const at = settlementNumber(r);
  if (at) return at;
  return "No number";
}

function DriverSettlementCell({ row }: { row: TourListRow }) {
  const label = driverSettlementLabel(row);
  const noNumber = label === "No number";
  return (
    <EntityLink
      kind="settlement"
      id={row.settlement_id}
      label={label}
      className={noNumber ? "font-bold text-[#B91C1C]" : "ldt-link font-semibold"}
      data-testid={noNumber ? "company-setl-driver-no-number" : "company-setl-driver-link"}
    />
  );
}

function CompanySettlementCell({ row }: { row: TourListRow }) {
  const id = row.company_settlement_id;
  const label = (row.company_settlement_display_id ?? "").trim() || "Company settlement";
  if (id) {
    return (
      <EntityLink
        kind="company_settlement"
        id={id}
        label={label}
        className="ldt-link font-semibold"
        data-testid="company-setl-company-link"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5" data-testid="company-setl-company-not-opened">
      <span className="inline-block h-1.5 w-1.5 rounded-sm bg-[#B45309]" aria-hidden />
      <span className="text-[#B45309]">not opened</span>
    </span>
  );
}

export function CompanySettlementsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selected, setSelected] = useState<CompanySettlementListRow | null>(null);
  const [searchParams] = useSearchParams();
  const deepLinkId = searchParams.get("id");

  // Board grain = closed tours (Settlements-Company.dc.html).
  const toursQuery = useQuery({
    queryKey: ["settlements-module", "company-settlements-board", "tours", "closed", companyId],
    queryFn: () => listTours(companyId, "closed"),
    enabled: Boolean(companyId),
  });

  // Waterfall deep-link / row open still uses company-settlement periods (same report engine).
  const periodsQuery = useQuery({
    queryKey: ["accounting", "company-settlements", companyId],
    queryFn: () => listCompanySettlements(companyId),
    enabled: Boolean(companyId),
  });

  const tourRows = toursQuery.data?.rows ?? [];
  const periodRows = periodsQuery.data?.company_settlements ?? [];

  const withCompany = tourRows.filter((r) => Boolean(r.company_settlement_id)).length;
  const notOpened = tourRows.length - withCompany;
  const totalMargin = tourRows.reduce((sum, r) => sum + r.margin_cents, 0);

  useEffect(() => {
    if (!deepLinkId || selected) return;
    const match = periodRows.find((r) => r.id === deepLinkId);
    if (match) setSelected(match);
  }, [deepLinkId, periodRows, selected]);

  const openWaterfallForTour = (r: TourListRow) => {
    const id = r.company_settlement_id;
    if (!id) return;
    const match = periodRows.find((p) => p.id === id);
    if (match) {
      setSelected(match);
      return;
    }
    // Period list may lag; open waterfall with tour-sourced identity.
    setSelected({
      id,
      display_id: (r.company_settlement_display_id ?? "").trim() || id.slice(0, 8),
      period_start: r.trip_started_at ?? "",
      period_end: r.trip_closed_at ?? "",
      status: "closed",
      closed_at: r.trip_closed_at,
      voided_at: null,
      driver_settlement_count: 1,
      net_revenue_cents: r.margin_cents,
    });
  };

  const columns = useMemo<ParityColumn<TourListRow>[]>(
    () => [
      {
        key: "company_settlement",
        label: "Company settlement",
        alwaysVisible: true,
        testId: "company-setl-col-company",
        sortable: true,
        className: "whitespace-nowrap",
        minWidth: 120,
        sortValue: (r) =>
          r.company_settlement_id
            ? (r.company_settlement_display_id ?? r.company_settlement_id)
            : "not opened",
        render: (r) => <CompanySettlementCell row={r} />,
        exportValue: (r) =>
          r.company_settlement_id
            ? (r.company_settlement_display_id ?? r.company_settlement_id)
            : "not opened",
      },
      {
        key: "driver_settlement",
        label: "Driver settlement",
        alwaysVisible: true,
        testId: "company-setl-col-driver-settlement",
        sortable: true,
        className: "whitespace-nowrap",
        minWidth: 120,
        sortValue: (r) => driverSettlementLabel(r),
        render: (r) => <DriverSettlementCell row={r} />,
        exportValue: (r) => driverSettlementLabel(r),
      },
      {
        key: "driver",
        label: "Driver",
        testId: "company-setl-col-driver",
        sortable: true,
        minWidth: 140,
        maxWidth: 220,
        cellClass: "whitespace-nowrap",
        sortValue: (r) => r.driver_name ?? "",
        render: (r) => (
          <EntityLinkOrTombstone
            kind="driver"
            id={r.driver_id}
            name={formatDisplayName(r.driver_name)}
            noun="Driver"
            className="block max-w-[200px] truncate"
          />
        ),
      },
      {
        key: "revenue",
        label: "Revenue",
        testId: "company-setl-col-revenue",
        sortable: true,
        cellClass: QBO_MONEY_CELL_CLASS,
        minWidth: 100,
        sortValue: (r) => r.revenue_cents,
        render: (r) => formatUsdCents(r.revenue_cents),
        exportValue: (r) => formatUsdCents(r.revenue_cents),
      },
      {
        key: "costs",
        label: "Costs",
        testId: "company-setl-col-costs",
        sortable: true,
        cellClass: QBO_MONEY_CELL_CLASS,
        minWidth: 100,
        sortValue: (r) => r.costs_cents,
        render: (r) => formatUsdCents(r.costs_cents),
        exportValue: (r) => formatUsdCents(r.costs_cents),
      },
      {
        key: "driver_pay",
        label: "Driver pay",
        testId: "company-setl-col-driver-pay",
        sortable: true,
        cellClass: QBO_MONEY_CELL_CLASS,
        minWidth: 100,
        sortValue: (r) => r.driver_pay_cents,
        render: (r) => formatUsdCents(r.driver_pay_cents),
        exportValue: (r) => formatUsdCents(r.driver_pay_cents),
      },
      {
        key: "margin",
        label: "Margin",
        testId: "company-setl-col-margin",
        sortable: true,
        cellClass: QBO_MONEY_CELL_CLASS,
        minWidth: 100,
        sortValue: (r) => r.margin_cents,
        render: (r) => (
          <span className={r.margin_cents < 0 ? "text-[#991B1B]" : undefined}>
            {formatUsdCents(r.margin_cents)}
          </span>
        ),
        exportValue: (r) => formatUsdCents(r.margin_cents),
      },
      {
        key: "margin_pct",
        label: "Margin %",
        testId: "company-setl-col-margin-pct",
        sortable: true,
        cellClass: "whitespace-nowrap text-right tabular-nums",
        minWidth: 76,
        sortValue: (r) => r.margin_pct ?? -Infinity,
        render: (r) =>
          r.margin_pct == null ? (
            DASH
          ) : (
            <span className={r.margin_pct < 0 ? "text-[#991B1B]" : undefined}>
              {r.margin_pct.toFixed(1)}%
            </span>
          ),
        exportValue: (r) => (r.margin_pct == null ? DASH : `${r.margin_pct.toFixed(1)}%`),
      },
    ],
    []
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Company Settlements"
        subtitle="Revenue · costs · driver pay · margin per tour"
      />

      <NavyPageSubNav items={[...SETTLEMENTS_SUBNAV]} />

      {/* ROUND 443.274-C — KPI strip from listTours(closed); board table is the tour grain. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="company-settlements-kpi-strip"
        data-company-settlements-v3-kpis="1"
      >
        <V3KpiTile
          label="Closed tours"
          value={toursQuery.isError ? "—" : String(tourRows.length)}
          sub="listTours closed"
          testId="company-settlements-kpi-total"
        />
        <V3KpiTile
          label="With company settlement"
          value={toursQuery.isError ? "—" : String(withCompany)}
          sub="company_settlement_id set"
          testId="company-settlements-kpi-with-company"
        />
        <V3KpiTile
          label="Not opened"
          value={toursQuery.isError ? "—" : String(notOpened)}
          sub="amber · no company settlement yet"
          testId="company-settlements-kpi-not-opened"
        />
        <V3KpiTile
          label="Total margin"
          value={toursQuery.isError ? "—" : formatUsdCents(totalMargin)}
          sub="sum of tour margin"
          testId="company-settlements-kpi-margin"
        />
      </div>

      {toursQuery.isError ? (
        <ListErrorBanner
          message="Failed to load company settlements."
          onRetry={() => void toursQuery.refetch()}
        />
      ) : null}

      <div data-company-settlements-v3-panel="1">
        <V3Panel
          title="Company settlements"
          subtitle="Revenue · costs · driver pay · margin per tour"
          testId="company-settlements-list-panel"
        >
          <ParityTable
            title="Company settlements"
            columns={columns}
            rows={tourRows}
            rowKey={(r) => r.settlement_id}
            loading={toursQuery.isPending && Boolean(companyId)}
            onRowClick={(r) => openWaterfallForTour(r)}
            rowClassName={(r) =>
              selected?.id && r.company_settlement_id === selected.id ? "bg-[#F7F8FA]" : ""
            }
            emptyText={
              companyId
                ? "No closed tours yet."
                : "Select a company to view its company settlements."
            }
            storageKey="company-settlements-tour-board"
            exportFilename="company-settlements-tours"
            footerCells={{
              company_settlement: (v) => (
                <span
                  className="font-semibold uppercase tracking-[0.4px] text-gray-600 text-section-header"
                  data-testid="company-settlements-tour-totals-label"
                >
                  Totals ({v.length})
                </span>
              ),
              revenue: (v) => formatUsdCents(v.reduce((n, r) => n + r.revenue_cents, 0)),
              costs: (v) => formatUsdCents(v.reduce((n, r) => n + r.costs_cents, 0)),
              driver_pay: (v) => formatUsdCents(v.reduce((n, r) => n + r.driver_pay_cents, 0)),
              margin: (v) => formatUsdCents(v.reduce((n, r) => n + r.margin_cents, 0)),
            }}
          />
        </V3Panel>
      </div>

      {selected ? (
        <CompanySettlementWaterfall
          companyId={companyId}
          row={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

function CompanySettlementWaterfall({
  companyId,
  row,
  onClose,
}: {
  companyId: string;
  row: CompanySettlementListRow;
  onClose: () => void;
}) {
  const reportQuery = useQuery({
    queryKey: ["accounting", "company-settlement-report", companyId, row.id],
    queryFn: () => getCompanySettlementReport(row.id, companyId),
    enabled: Boolean(companyId) && Boolean(row.id),
  });

  const report = reportQuery.data;
  const isVoided = Boolean(row.voided_at);

  return (
    <div className="ldt-card" data-surface="load-detail" data-testid="company-settlement-waterfall">
      <div className="ldt-ch">
        <span>
          Company Settlement · {row.display_id} · {date(row.period_start)} – {date(row.period_end)}
        </span>
        <span className="ldt-actions">
          <button
            type="button"
            className="ldt-btn"
            data-testid="company-settlement-pdf-view"
            onClick={() => openCanonicalDocument(companySettlementHtmlUrl(companyId, row.id))}
          >
            View settlement PDF
          </button>
          <button
            type="button"
            className="ldt-btn"
            data-testid="company-settlement-pdf-print"
            onClick={() => openPrintableDocument(companySettlementHtmlUrl(companyId, row.id))}
          >
            Print
          </button>
          <button type="button" className="ldt-link" onClick={onClose}>
            Close
          </button>
        </span>
      </div>

      {isVoided ? (
        <div className="ldt-note bad">
          This company settlement is voided — its waterfall is retained for audit but carries no live
          net revenue (shown as {DASH} on the list).
        </div>
      ) : null}

      {reportQuery.isError ? (
        <div className="p-2">
          <ListErrorBanner
            message="Failed to load the settlement waterfall."
            onRetry={() => void reportQuery.refetch()}
          />
        </div>
      ) : reportQuery.isPending ? (
        <div className="ldt-hint">Loading waterfall…</div>
      ) : !report ? (
        <div className="ldt-hint">No waterfall available for this settlement.</div>
      ) : (
        <div className="ldt-rows">
          <div className="ldt-row head">
            <span>Waterfall</span>
            <span className="ldt-right">Amount</span>
          </div>

          <div className="ldt-row">
            <span>Gross Revenue (Invoiced)</span>
            <span className="ldt-m">{money(report.sections.revenue.invoiced_cents)}</span>
          </div>

          {report.sections.pl_rollup.lines.map((line) => (
            <div className="ldt-row" key={line.line_type}>
              <span>Less · {line.label}</span>
              <span className="ldt-m">{money(line.amount_cents)}</span>
            </div>
          ))}

          <div className="ldt-row">
            <span>
              Less · Fuel Purchases
              {report.sections.fuel_purchases.total_gallons > 0
                ? ` (${report.sections.fuel_purchases.total_gallons.toLocaleString()} gal)`
                : ""}
            </span>
            <span className="ldt-m">{money(report.sections.fuel_purchases.total_cents)}</span>
          </div>

          <div className="ldt-row">
            <span>Less · Company Expenses</span>
            <span className="ldt-m">{money(report.sections.expenses.total_cents)}</span>
          </div>

          <div className="ldt-row big">
            <span>Net Revenue</span>
            <span className="ldt-m">
              {isVoided ? DASH : money(report.sections.pl_rollup.net_revenue_cents)}
            </span>
          </div>

          {report.sections.miles_and_mpg.total_miles > 0 ? (
            <div className="ldt-row tot">
              <span>
                Miles {report.sections.miles_and_mpg.total_miles.toLocaleString()}
                {report.sections.miles_and_mpg.mpg !== null
                  ? ` · ${report.sections.miles_and_mpg.mpg} MPG`
                  : ""}
              </span>
              <span className="ldt-m">{DASH}</span>
            </div>
          ) : null}

          {report.sections.margins ? (
            <>
              <div className="ldt-row">
                <span>Cash margin · fuel purchased</span>
                <span className="ldt-m">
                  {isVoided ? DASH : money(report.sections.margins.cash_margin_cents)}
                </span>
              </div>
              <div className="ldt-row">
                <span>
                  True-cost margin · fuel consumed
                  {report.sections.fuel_consumed && report.sections.fuel_consumed.total_gallons > 0
                    ? ` (${report.sections.fuel_consumed.total_gallons.toLocaleString()} gal)`
                    : ""}
                </span>
                <span className="ldt-m">
                  {isVoided ? DASH : money(report.sections.margins.true_cost_margin_cents)}
                </span>
              </div>
              <div className="ldt-row">
                <span>
                  Economic margin · after downtime
                  {report.sections.downtime_ledger && report.sections.downtime_ledger.events.length > 0
                    ? ` (${report.sections.downtime_ledger.events.length} event${report.sections.downtime_ledger.events.length === 1 ? "" : "s"})`
                    : ""}
                </span>
                <span className="ldt-m">
                  {isVoided ? DASH : money(report.sections.margins.economic_margin_cents)}
                </span>
              </div>
            </>
          ) : null}
        </div>
      )}

      {report ? (
        <>
          <div className="ldt-ch" style={{ marginTop: 8 }}>
            <span>Itemized by load</span>
          </div>
          <CompanySettlementItemizedByLoad report={report} />
        </>
      ) : null}
    </div>
  );
}
