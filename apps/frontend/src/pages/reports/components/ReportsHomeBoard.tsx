/**
 * ROUND 443.267 board 7 — Reports Home (board-faithful).
 * Board: ~/Downloads/10-22-2026-LEAD-MOD-DESIGN-V3-Reports.dc.html
 * Sections: KPI strip → Accounting + financial table (☆|Report|What it shows|Basis|Open in viewer|Export).
 * Engines: getKpiSummary · getIftaStatus · PHASE_6_REPORT_HREFS · BasisSelector.
 * Rule 07: extra accounting launch rows kept below the board's 9 primary rows (View all expands).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getIftaStatus, getKpiSummary } from "../../../api/reports";
import {
  BasisSelector,
  type AccountingBasis,
} from "../../../components/accounting/BasisSelector";
import { PHASE_6_REPORT_HREFS } from "../../../components/reports/phase6ReportLinks";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { mmmDd } from "../../../lib/formatDate";
import { userFacingApiError } from "../../../lib/api-error-message";

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: V3_TABLE.headerPx,
  fontWeight: 600,
  color: V3.muted,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.border}`,
  background: V3.headerBg,
  whiteSpace: "nowrap",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: CSSProperties = {
  fontSize: V3_TABLE.fontPx,
  color: V3.ink,
  padding: `${V3_TABLE.rowPadY}px 12px`,
  borderBottom: `1px solid ${V3.borderSoft}`,
  verticalAlign: "middle",
};

/** Board primary 9 + Rule-07 extras (same launch tuples the hub always had). */
const ACCOUNTING_FINANCIAL_ROWS = [
  ["trial-balance", "Trial balance", "Debits and credits by account", true],
  ["profit-loss", "Profit & loss", "By month · truck · load · customer", true],
  ["balance-sheet", "Balance sheet", "As of any date", true],
  ["cash-flow-statement", "Cash flow statement", "Operating · investing · financing", true],
  ["settlement-summary", "Settlement summary", "Driver pay by week", true],
  ["customer-profitability", "Customer profitability", "Revenue − direct cost", true],
  ["profit-per-truck", "Per-truck CPM dashboard", "Cost per mile by unit", true],
  ["fuel-reconciliation", "Fuel reconciliation", "Cards vs fills vs loads", true],
  ["maintenance-cost-per-unit", "Maintenance cost per unit", "By unit and month", true],
  // Rule 07 extras — kept on the surface (View all / expanded), never removed.
  ["cash-flow-overview", "Cash flow overview", "Cash position and near-term runway", false],
  ["geofence-dwell", "Geofence dwell report", "Dwell time at customer and yard fences", false],
  ["posted-while-tour-open", "Posted while tour open", "Money posted before tour close", false],
  ["reefer-fuel-credit", "Reefer fuel credit", "Federal reefer diesel credit gallons", false],
  ["scheduled-reports", "Default report subscriptions", "Automation · email queue", false],
] as const;

const BASIS_AWARE = new Set(["trial-balance", "profit-loss", "balance-sheet"]);

export function ReportsHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [basis, setBasis] = useState<AccountingBasis>("accrual");
  const [showAll, setShowAll] = useState(false);

  const kpiQuery = useQuery({
    queryKey: ["reports", "home-board", "kpi-summary", companyId],
    queryFn: () => getKpiSummary(companyId),
    enabled: Boolean(companyId),
  });
  const iftaQuery = useQuery({
    queryKey: ["reports", "home-board", "ifta-status", companyId],
    queryFn: () => getIftaStatus(companyId),
    enabled: Boolean(companyId),
  });

  const kpiReady = kpiQuery.isSuccess && kpiQuery.data != null;
  // KPI summary carries { quarter, dueAt, daysUntilDue }; getIftaStatus is currentQuarter/nextDueAt.
  const iftaFromKpi = kpiQuery.data?.ifta_status ?? null;
  const iftaFromStatus = iftaQuery.data
    ? {
        quarter: iftaQuery.data.currentQuarter,
        dueAt: iftaQuery.data.nextDueAt,
        daysUntilDue: iftaQuery.data.daysUntilDue,
      }
    : null;
  const ifta = iftaFromKpi ?? iftaFromStatus;
  const loading = kpiQuery.isLoading && !kpiQuery.isSuccess;
  const errored = kpiQuery.isError || iftaQuery.isError;
  const errorMsg = kpiQuery.isError
    ? userFacingApiError(kpiQuery.error, "Failed to load reports KPIs.")
    : iftaQuery.isError
      ? userFacingApiError(iftaQuery.error, "Failed to load IFTA status.")
      : null;

  const rows = useMemo(
    () => (showAll ? ACCOUNTING_FINANCIAL_ROWS : ACCOUNTING_FINANCIAL_ROWS.filter((r) => r[3])),
    [showAll],
  );

  function openReport(reportKey: string) {
    const href = PHASE_6_REPORT_HREFS[reportKey];
    if (!href) return;
    if (BASIS_AWARE.has(reportKey)) {
      navigate(`${href}?basis=${basis}`);
      return;
    }
    navigate(href);
  }

  function basisLabel(reportKey: string): string {
    if (BASIS_AWARE.has(reportKey)) return basis === "cash" ? "Cash" : "Accrual";
    return "Accrual";
  }

  const dash = (v: number | null | undefined) =>
    v == null || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);

  return (
    <div className="min-w-0 space-y-3" data-testid="reports-home-board" data-reports-home-board="1">
      {errored ? (
        <ListErrorBanner
          message={errorMsg ?? "Reports data could not be loaded."}
          onRetry={() => {
            void kpiQuery.refetch();
            void iftaQuery.refetch();
          }}
        />
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
        data-testid="reports-home-kpi-strip"
      >
        <V3KpiTile
          testId="reports-kpi-available"
          label="Available reports"
          value={loading && !kpiReady ? "…" : dash(kpiQuery.data?.available_reports)}
          sub={kpiReady ? "categories live" : kpiQuery.isError ? "Failed to load" : "Loading…"}
        />
        <V3KpiTile
          testId="reports-kpi-schedules"
          label="Custom schedules"
          value={loading && !kpiReady ? "…" : dash(kpiQuery.data?.scheduled)}
          sub={kpiReady ? "auto-emailed" : kpiQuery.isError ? "Failed to load" : "Loading…"}
          onClick={() => navigate("/reports/scheduled")}
        />
        <V3KpiTile
          testId="reports-kpi-run-7d"
          label="Run last 7 days"
          value={loading && !kpiReady ? "…" : dash(kpiQuery.data?.run_last_7d)}
          sub={kpiReady ? "across all users" : kpiQuery.isError ? "Failed to load" : "Loading…"}
        />
        <V3KpiTile
          testId="reports-kpi-ifta"
          label={ifta ? `IFTA ${ifta.quarter} due` : "IFTA due"}
          value={
            ifta
              ? `${ifta.daysUntilDue}d`
              : iftaQuery.isError || kpiQuery.isError
                ? "—"
                : loading
                  ? "…"
                  : "—"
          }
          sub={
            ifta
              ? `${mmmDd(ifta.dueAt)} — file before`
              : iftaQuery.isError
                ? "Failed to load"
                : "Loading…"
          }
          tone={ifta ? "amber" : "muted"}
          onClick={() => navigate("/reports/ifta-preparer")}
        />
      </div>

      <V3Panel
        title="Accounting + financial reports"
        subtitle="Core accounting statements plus operational finance views"
        onViewAll={() => setShowAll((v) => !v)}
        viewAllLabel={showAll ? "Show primary →" : "View all →"}
        headerRight={<BasisSelector value={basis} onChange={setBasis} />}
        testId="reports-home-accounting-financial"
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}
            data-testid="reports-accounting-financial-table"
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 28 }} aria-label="Favorite">
                  ☆
                </th>
                <th style={thStyle}>Report</th>
                <th style={thStyle}>What it shows</th>
                <th style={thStyle}>Basis</th>
                <th style={thStyle}>Open in viewer</th>
                <th style={thStyle}>Export</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([reportKey, label, shows]) => (
                <tr key={reportKey} data-testid={`reports-acct-row-${reportKey}`}>
                  <td style={{ ...tdStyle, color: V3.muted, textAlign: "center" }}>☆</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      className="text-left font-semibold hover:underline"
                      style={{ color: V3.ink, fontSize: V3_TABLE.fontPx }}
                      onClick={() => openReport(reportKey)}
                    >
                      {label}
                    </button>
                  </td>
                  <td style={{ ...tdStyle, color: V3.muted }}>{shows}</td>
                  <td style={tdStyle}>{basisLabel(reportKey)}</td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      className="font-semibold hover:underline"
                      style={{ color: V3.ink, fontSize: V3_TABLE.fontPx }}
                      onClick={() => openReport(reportKey)}
                    >
                      Run →
                    </button>
                  </td>
                  <td style={{ ...tdStyle, color: V3.muted }}>
                    <button
                      type="button"
                      className="hover:underline"
                      style={{ color: V3.muted, fontSize: V3_TABLE.fontPx }}
                      title="Opens the live viewer — export PDF / XLSX from the report with filters applied"
                      onClick={() => openReport(reportKey)}
                    >
                      PDF · XLSX
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          className="px-3 py-2 text-xs"
          style={{ color: V3.muted, borderTop: `1px solid ${V3.borderSoft}` }}
        >
          Report name or Run → opens the live report viewer (dates, basis, search, columns — edit and
          re-run). PDF / XLSX export exactly what the viewer shows with the filters applied.
        </p>
      </V3Panel>
    </div>
  );
}
