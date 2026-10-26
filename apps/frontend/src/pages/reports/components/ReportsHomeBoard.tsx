/**
 * ROUND 443.267 → FINAL-3 row 40 — Reports Home board (v3, sidebar, non-layered).
 * v3 spec: docs/design/v3/Reports.dc.html — KPI strip → two-column (200px sidebar + right panel).
 * Selected category drives the right panel. Financial = detailed accounting table + management rows (Rule 07).
 * Automation = ScheduledReportsPanel. Saved = Custom report entry. Others = simple report table.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getFrequentlyRun, getIftaStatus, getKpiSummary, type FrequentlyRunReport } from "../../../api/reports";
import { FrequentlyRunTable } from "../../../components/reports/FrequentlyRunTable";
import {
  BasisSelector,
  type AccountingBasis,
} from "../../../components/accounting/BasisSelector";
import { PHASE_6_REPORT_HREFS } from "../../../components/reports/phase6ReportLinks";
import { IftaPreparerCard } from "../../../components/reports/IftaPreparerCard";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3, V3_TABLE } from "../../../design/v3-tokens";
import { mmmDd } from "../../../lib/formatDate";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ScheduledReportsPanel } from "../ScheduledReportsPanel";

// ── Sidebar categories (v3 design) ──────────────────────────────────────────
const SIDEBAR_CATEGORIES = [
  { id: "financial" as const, label: "Financial" },
  { id: "operations" as const, label: "Operations" },
  { id: "drivers" as const, label: "Drivers" },
  { id: "fleet" as const, label: "Fleet" },
  { id: "fuel" as const, label: "Fuel" },
  { id: "safety" as const, label: "Safety" },
  { id: "compliance" as const, label: "Compliance" },
  { id: "automation" as const, label: "Automation" },
  { id: "saved" as const, label: "Saved" },
] as const;
type SidebarCategory = typeof SIDEBAR_CATEGORIES[number]["id"];

// ── Financial — board primary 9 + Rule-07 management rows ───────────────────
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
  // Rule 07 extras — always on the hub; View all expands them.
  ["cash-flow-overview", "Cash flow overview", "Cash position and near-term runway", false],
  ["geofence-dwell", "Geofence dwell report", "Dwell time at customer and yard fences", false],
  ["posted-while-tour-open", "Posted while tour open", "Money posted before tour close", false],
  ["reefer-fuel-credit", "Reefer fuel credit", "Federal reefer diesel credit gallons", false],
  ["scheduled-reports", "Default report subscriptions", "Automation · email queue", false],
] as const;

/** Rule 07 — management report compilations always shown on the hub. */
const MANAGEMENT_ROWS = [
  { type: "company-overview", label: "Company Overview", sub: "P&L + Balance Sheet" },
  { type: "sales-performance", label: "Sales Performance", sub: "P&L + A/R Aging + Customer Summary" },
  { type: "expenses-performance", label: "Expenses Performance", sub: "P&L + A/P Aging + Vendor Summary" },
] as const;

const BASIS_AWARE = new Set(["trial-balance", "profit-loss", "balance-sheet"]);

// ── Non-financial category report rows ────────────────────────────────────────
const SIMPLE_CATEGORY_ROWS: Partial<Record<SidebarCategory, { id: string; label: string; shows: string }[]>> = {
  operations: [
    { id: "loads-report", label: "Loads report", shows: "All loads with status and P&L" },
    { id: "deadhead", label: "Deadhead report", shows: "Empty miles by unit and lane" },
    { id: "lane-profitability", label: "Lane profitability", shows: "Revenue and cost by lane" },
    { id: "geofence-dwell", label: "Geofence dwell", shows: "Dwell time at customer fences" },
    { id: "dispatch-margin", label: "Dispatch margin", shows: "Margin per load and customer" },
  ],
  drivers: [
    { id: "settlement-summary", label: "Settlement summary", shows: "Driver pay by week" },
  ],
  fleet: [
    { id: "profit-per-truck", label: "Per-truck CPM dashboard", shows: "Cost per mile by unit" },
    { id: "maintenance-cost-per-unit", label: "Maintenance cost per unit", shows: "By unit and month" },
  ],
  fuel: [
    { id: "fuel-reconciliation", label: "Fuel reconciliation", shows: "Cards vs fills vs loads" },
    { id: "reefer-fuel-credit", label: "Reefer fuel credit", shows: "Federal reefer diesel credit gallons" },
  ],
  safety: [],
  compliance: [
    { id: "posted-while-tour-open", label: "Posted while tour open", shows: "Money posted before tour close" },
  ],
};

// ── Styles ────────────────────────────────────────────────────────────────────
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

// ── Component ─────────────────────────────────────────────────────────────────
export function ReportsHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [basis, setBasis] = useState<AccountingBasis>("accrual");
  const [showAll, setShowAll] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SidebarCategory>("financial");

  const kpiQuery = useQuery({
    queryKey: ["reports", "home-board", "kpi-summary", companyId],
    queryFn: () => getKpiSummary(companyId),
    enabled: Boolean(companyId),
  });
  // Rule 07 (never remove): Frequently run stays on the hub — real API rows only, nothing fabricated.
  const frequentQuery = useQuery({
    queryKey: ["reports", "home-board", "frequently-run", companyId],
    queryFn: () => getFrequentlyRun(companyId),
    enabled: Boolean(companyId),
  });
  const iftaQuery = useQuery({
    queryKey: ["reports", "home-board", "ifta-status", companyId],
    queryFn: () => getIftaStatus(companyId),
    enabled: Boolean(companyId),
  });

  const kpiReady = kpiQuery.isSuccess && kpiQuery.data != null;
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

  const accountingRows = useMemo(
    () => (showAll ? ACCOUNTING_FINANCIAL_ROWS : ACCOUNTING_FINANCIAL_ROWS.filter((r) => r[3])),
    [showAll],
  );

  const dash = (v: number | null | undefined) =>
    v == null || (typeof v === "number" && !Number.isFinite(v)) ? "—" : String(v);

  function openReport(reportKey: string) {
    const href = PHASE_6_REPORT_HREFS[reportKey];
    if (!href) return;
    if (BASIS_AWARE.has(reportKey)) {
      navigate(`${href}?basis=${basis}`);
      return;
    }
    navigate(href);
  }

  function runFrequentReport(row: FrequentlyRunReport) {
    const href = PHASE_6_REPORT_HREFS[row.id];
    if (href) {
      navigate(href);
      return;
    }
    if (row.id === "ar-aging") {
      navigate("/reports/ar-aging");
      return;
    }
    if (row.id === "ap-aging") {
      navigate("/reports/ap-aging");
      return;
    }
    navigate(`/reports/run/${encodeURIComponent(row.id)}`);
  }

  function basisLabel(reportKey: string): string {
    return BASIS_AWARE.has(reportKey) ? (basis === "cash" ? "Cash" : "Accrual") : "Accrual";
  }

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

      {/* KPI strip */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}
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
            ifta ? `${ifta.daysUntilDue}d`
              : iftaQuery.isError || kpiQuery.isError ? "—"
              : loading ? "…" : "—"
          }
          sub={ifta ? `${mmmDd(ifta.dueAt)} — file before` : iftaQuery.isError ? "Failed to load" : "Loading…"}
          tone={ifta ? "amber" : "muted"}
          onClick={() => navigate("/reports/ifta-preparer")}
        />
      </div>

      {/* Two-column: sidebar + right panel (v3 design) */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12, alignItems: "start" }}>

        {/* Left: category sidebar — the report-catalog category nav (v3 spec replaces the old hover nav). */}
        <V3Panel title="Categories" testId="reports-category-nav">
          <nav aria-label="Report categories" className="p-1.5">
          {SIDEBAR_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="w-full rounded-sm px-2.5 py-1.5 text-left text-xs font-semibold transition-colors"
              style={{
                background: activeCategory === cat.id ? "#EEF2F7" : "transparent",
                color: activeCategory === cat.id ? "#0F1219" : "#374151",
              }}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}
          </nav>
        </V3Panel>

        {/* Right: category panel */}
        <div>
          {activeCategory === "financial" ? (
            <>
              <V3Panel
                title="Accounting &amp; financial"
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
                        <th style={{ ...thStyle, width: 28 }} aria-label="Favorite">☆</th>
                        <th style={thStyle}>Report</th>
                        <th style={thStyle}>What it shows</th>
                        <th style={thStyle}>Basis</th>
                        <th style={thStyle}>Open in viewer</th>
                        <th style={thStyle}>Export</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountingRows.map(([reportKey, label, shows]) => (
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
                <p className="px-3 py-2 text-xs" style={{ color: V3.muted, borderTop: `1px solid ${V3.borderSoft}` }}>
                  Report name or Run → opens the live report viewer (dates, basis, search, columns — edit and re-run). PDF · XLSX export exactly what the viewer shows with the filters applied.
                </p>
              </V3Panel>

              {/* Rule 07 — management compilations stay on the hub */}
              <div className="mt-3">
              <V3Panel
                title="Management reports"
                subtitle="Branded financial compilations — lender, insurance, and stakeholder ready"
                testId="reports-home-management"
              >
                <div className="grid sm:grid-cols-3 sm:divide-x sm:divide-[#E5E7EB]">
                  {MANAGEMENT_ROWS.map(({ type, label, sub }) => (
                    <button
                      key={type}
                      type="button"
                      className="border-t border-[#E5E7EB] px-3 py-2 text-left hover:bg-[#F7F8FA]"
                      onClick={() => navigate(`/reports/management?type=${type}`)}
                    >
                      <div className="text-xs font-semibold text-[#0F1219]">{label}</div>
                      <div className="mt-0.5 text-xs text-[#6B7280]">{sub}</div>
                    </button>
                  ))}
                </div>
              </V3Panel>
              </div>
            </>
          ) : activeCategory === "automation" ? (
            <ScheduledReportsPanel />
          ) : activeCategory === "saved" ? (
            <V3Panel title="Saved" testId="reports-category-panel-saved">
            <div className="px-3 py-4 text-center text-xs text-[#4B5563]">
              <p>Open <strong className="text-[#0F1219]">+ Custom report</strong> (top right) to build and save reports — saved definitions appear in the builder list.</p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
                onClick={() => navigate("/reports/custom")}
              >
                Open report builder →
              </button>
            </div>
            </V3Panel>
          ) : (
            /* Simple report table for other categories */
            <SimpleCategoryPanel
              category={activeCategory}
              rows={SIMPLE_CATEGORY_ROWS[activeCategory] ?? []}
              onRun={(id) => { const href = PHASE_6_REPORT_HREFS[id]; if (href) navigate(href); }}
            />
          )}
        </div>
      </div>

      {/* Rule 07 — Frequently run stays on the hub (restored after the v3 rebuild #27715 dropped it). */}
      <V3Panel title="Frequently run" subtitle="Your most-run reports — run counts from the report log" testId="reports-home-frequently-run">
        {frequentQuery.isError ? (
          <ListErrorBanner
            message={userFacingApiError(frequentQuery.error, "Failed to load frequently run reports.")}
            onRetry={() => void frequentQuery.refetch()}
          />
        ) : frequentQuery.isLoading ? (
          <div className="px-3 py-2 text-xs text-[#6B7280]">Loading…</div>
        ) : (
          <FrequentlyRunTable rows={frequentQuery.data ?? []} onRun={runFrequentReport} />
        )}
      </V3Panel>

      {/* IFTA preparer (S05) — the quarter, due date and countdown from the real IFTA status; drawn only once loaded. */}
      {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}
    </div>
  );
}

function SimpleCategoryPanel({
  category,
  rows,
  onRun,
}: {
  category: SidebarCategory;
  rows: { id: string; label: string; shows: string }[];
  onRun: (id: string) => void;
}) {
  const tdS: CSSProperties = { fontSize: V3_TABLE.fontPx, color: V3.ink, padding: `${V3_TABLE.rowPadY}px 12px`, borderBottom: `1px solid ${V3.borderSoft}`, verticalAlign: "middle" };
  const label = SIDEBAR_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  return (
    <V3Panel title={label} testId={`reports-category-panel-${category}`}>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-[#6B7280]">No reports in this category yet.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", fontSize: V3_TABLE.headerPx, fontWeight: 600, color: V3.muted, padding: `${V3_TABLE.rowPadY}px 12px`, borderBottom: `1px solid ${V3.border}`, background: V3.headerBg, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>Report</th>
              <th style={{ textAlign: "left", fontSize: V3_TABLE.headerPx, fontWeight: 600, color: V3.muted, padding: `${V3_TABLE.rowPadY}px 12px`, borderBottom: `1px solid ${V3.border}`, background: V3.headerBg, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>What it shows</th>
              <th style={{ textAlign: "left", fontSize: V3_TABLE.headerPx, fontWeight: 600, color: V3.muted, padding: `${V3_TABLE.rowPadY}px 12px`, borderBottom: `1px solid ${V3.border}`, background: V3.headerBg, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>Run</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdS}>
                  <button type="button" className="text-left font-semibold hover:underline" style={{ color: V3.ink, fontSize: V3_TABLE.fontPx }} onClick={() => onRun(r.id)}>
                    {r.label}
                  </button>
                </td>
                <td style={{ ...tdS, color: V3.muted }}>{r.shows}</td>
                <td style={tdS}>
                  <button type="button" className="font-semibold hover:underline" style={{ color: V3.ink, fontSize: V3_TABLE.fontPx }} onClick={() => onRun(r.id)}>
                    Run →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </V3Panel>
  );
}
