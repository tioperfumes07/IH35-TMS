// TABLE_DATE_OMIT: these tables have no date column by design — they are the report CATALOG (one row per report: name / what it shows / basis / run / export); a report's dates are chosen in the live viewer it opens, not listed here.
/**
 * ROUND 443.267 → FINAL-3 row 40 → register row 53 (11-03) — Reports Home IS the board (v3, sidebar, NOT layered).
 * v3 spec: docs/design/v3/Reports.dc.html — KPI strip → two-column (200px sidebar + right panel), nothing below it.
 * Selected category drives the right panel. Financial = the accounting catalog table (the 3 Management report
 * compilations are catalog rows under View all — Rule 07: relocated, still reachable, never deleted).
 * Automation = ScheduledReportsPanel. Saved = Frequently run + Custom report entry. Compliance = report rows + the
 * IFTA preparer. Every catalog row is a real <Link> (anchor) to its route — never a button.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../../lib/returnContext";
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
import { REPORT_BOARDS } from "../boards/reportBoardCatalog";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

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

// ── Financial — board primary rows + Rule-07 extras (View all) ───────────────
/** [report key, label, what it shows, primary (shown before View all)] */
type CatalogRow = readonly [string, string, string, boolean];

/**
 * Rule 07 — the Management report compilations (Branded financial compilations — lender, insurance, and stakeholder
 * ready). Row 53: they are catalog rows of the board (View all), not a second panel stacked under it.
 */
const MANAGEMENT_ROWS = [
  { type: "company-overview", label: "Company Overview", sub: "P&L + Balance Sheet" },
  { type: "sales-performance", label: "Sales Performance", sub: "P&L + A/R Aging + Customer Summary" },
  { type: "expenses-performance", label: "Expenses Performance", sub: "P&L + A/P Aging + Vendor Summary" },
] as const;

const MANAGEMENT_KEY_PREFIX = "management-";

const ACCOUNTING_FINANCIAL_ROWS: readonly CatalogRow[] = [
  ["trial-balance", "Trial balance", "Debits and credits by account", true],
  ["profit-loss", "Profit & loss", "By month · truck · load · customer", true],
  ["balance-sheet", "Balance sheet", "As of any date", true],
  ["cash-flow-statement", "Cash flow statement", "Operating · investing · financing", true],
  ["settlement-summary", "Settlement summary", "Driver pay by week", true],
  // Rows 80-83 (11-03) — the report boards (catalog: pages/reports/boards/reportBoardCatalog.ts).
  ["driver-settlements-report", "Driver settlement report", "Every driver statement — gross, deductions, net, paid", true],
  ["company-settlements-report", "Company settlement report", "Profit per closed trip", true],
  ["customer-report", "Customer report", "Sales, open, aging, statement", true],
  ["vendor-report", "Vendor report", "Spend, open bills, category, 1099", true],
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
  // Management reports — Branded financial compilations (Rule 07; open /reports/management?type=…).
  ...MANAGEMENT_ROWS.map(
    ({ type, label, sub }): CatalogRow => [`${MANAGEMENT_KEY_PREFIX}${type}`, label, `Management reports — ${sub}`, false],
  ),
];

const BASIS_AWARE = new Set(["trial-balance", "profit-loss", "balance-sheet"]);

/** The route a catalog row opens — one resolver for the name, Run → and Export links. */
export function reportCatalogHref(
  reportKey: string,
  basis: AccountingBasis,
  originHref?: string | null,
): string | null {
  if (reportKey.startsWith(MANAGEMENT_KEY_PREFIX)) {
    const target = `/reports/management?type=${encodeURIComponent(reportKey.slice(MANAGEMENT_KEY_PREFIX.length))}`;
    return originHref ? withReturnContext(target, originHref) : target;
  }
  const href = PHASE_6_REPORT_HREFS[reportKey];
  if (!href) return null;
  const withBasis = BASIS_AWARE.has(reportKey) ? `${href}?basis=${basis}` : href;
  // ROUND 8.20 board25 — attach ret so TB/BS/PL Back restores Home Cash/Accrual selection.
  return originHref ? withReturnContext(withBasis, originHref) : withBasis;
}

/** A catalog cell: a real anchor to the report route (row 53 — rows open through links, not buttons). */
function CatalogLink({
  href,
  children,
  testId,
  muted = false,
  bold = true,
  title,
}: {
  href: string | null;
  children: ReactNode;
  testId?: string;
  muted?: boolean;
  bold?: boolean;
  title?: string;
}) {
  const style = { color: muted ? V3.muted : V3.ink, fontSize: V3_TABLE.fontPx };
  if (!href) return <span style={style}>{children}</span>;
  return (
    <Link to={href} className={`${bold ? "font-semibold " : ""}hover:underline`} style={style} data-testid={testId} title={title}>
      {children}
    </Link>
  );
}

// ── Non-financial category report rows ────────────────────────────────────────
const SIMPLE_CATEGORY_ROWS: Partial<Record<SidebarCategory, { id: string; label: string; shows: string }[]>> = {
  operations: [
    // Rows 79-84 (11-03) — the five report boards lead the Operations catalog.
    ...REPORT_BOARDS.map((b) => ({ id: b.id, label: b.label, shows: b.shows })),
    { id: "deadhead", label: "Deadhead report", shows: "Empty miles by unit and lane" },
    { id: "lane-profitability", label: "Lane profitability", shows: "Revenue and cost by lane" },
    { id: "geofence-dwell", label: "Geofence dwell", shows: "Dwell time at customer fences" },
    { id: "dispatch-margin", label: "Dispatch margin", shows: "Margin per load and customer" },
  ],
  drivers: [
    { id: "settlement-summary", label: "Settlement summary", shows: "Driver pay by week" },
    { id: "driver-settlements-report", label: "Driver settlement report", shows: "Every driver statement — gross, deductions, net, paid" },
    { id: "company-settlements-report", label: "Company settlement report", shows: "Profit per closed trip" },
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
// ── Component ─────────────────────────────────────────────────────────────────
export function ReportsHomeBoard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const originHref = currentOriginHref(pathname, searchParams.toString() ? `?${searchParams.toString()}` : "");
  const moneyHref = (target: string) => withReturnContext(target, originHref);
  // ROUND 8.20 board25 — Cash/Accrual lives in URL so TB/BS drills + Back restore the Home selection.
  const basis: AccountingBasis = (searchParams.get("basis") ?? "").toLowerCase() === "cash" ? "cash" : "accrual";
  const setBasis = (next: AccountingBasis) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "cash") p.set("basis", "cash");
        else p.delete("basis");
        return p;
      },
      { replace: true },
    );
  };
  const [showAll, setShowAll] = useState(false);
  // ROUND 8.20 board25 — category in URL so KPI drills + Back restore the selected catalog cohort.
  const catFromUrl = (searchParams.get("cat") ?? "").toLowerCase();
  const activeCategory: SidebarCategory = SIDEBAR_CATEGORIES.some((c) => c.id === catFromUrl)
    ? (catFromUrl as SidebarCategory)
    : "financial";
  const setActiveCategory = (next: SidebarCategory) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "financial") p.delete("cat");
        else p.set("cat", next);
        return p;
      },
      { replace: true },
    );
  };
  const cohortHref = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return withReturnContext(`${pathname}${q ? `?${q}` : ""}`, originHref);
  };
  // ROUND 8.20 board25 — KPI tiles shareable href+ret (not onClick-only).
  const financialCatHref = cohortHref({ cat: null });
  const savedCatHref = cohortHref({ cat: "saved" });
  const scheduledHref = withReturnContext("/reports/scheduled", originHref);
  const iftaHref = withReturnContext("/reports/ifta-preparer", originHref);

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

  const accountingColumns: ParityColumn<(typeof accountingRows)[number]>[] = [
    { key: "favorite", label: "☆", sortable: true, sortValue: ([, label]) => label, render: () => <span style={{ color: V3.muted }}>☆</span> },
    {
      key: "report",
      label: "Report",
      sortable: true,
      sortValue: ([, label]) => label,
      render: ([reportKey, label]) => (
        <CatalogLink href={reportCatalogHref(reportKey, basis, originHref)} testId={`reports-acct-link-${reportKey}`}>
          {label}
        </CatalogLink>
      ),
    },
    { key: "shows", label: "What it shows", sortable: true, sortValue: ([, , shows]) => shows, render: ([, , shows]) => <span style={{ color: V3.muted }}>{shows}</span> },
    { key: "basis", label: "Basis", sortable: true, sortValue: ([reportKey]) => basisLabel(reportKey), render: ([reportKey]) => basisLabel(reportKey) },
    {
      key: "open",
      label: "Open in viewer",
      sortable: true,
      sortValue: ([, label]) => label,
      render: ([reportKey]) => (
        <CatalogLink href={reportCatalogHref(reportKey, basis, originHref)} testId={`reports-acct-run-${reportKey}`}>
          Run →
        </CatalogLink>
      ),
    },
    {
      key: "export",
      label: "Export",
      sortable: true,
      sortValue: ([, label]) => label,
      render: ([reportKey]) => (
        <CatalogLink
          href={reportCatalogHref(reportKey, basis, originHref)}
          muted
          bold={false}
          title="Opens the live viewer — export PDF / XLSX from the report with filters applied"
        >
          PDF · XLSX
        </CatalogLink>
      ),
    },
  ];

  function runFrequentReport(row: FrequentlyRunReport) {
    const href = PHASE_6_REPORT_HREFS[row.id];
    if (href) {
      navigate(moneyHref(href));
      return;
    }
    if (row.id === "ar-aging") {
      navigate(moneyHref("/reports/ar-aging"));
      return;
    }
    if (row.id === "ap-aging") {
      navigate(moneyHref("/reports/ap-aging"));
      return;
    }
    navigate(moneyHref(`/reports/run/${encodeURIComponent(row.id)}`));
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
          // ROUND 8.20 board25 — STATUS FAIL: report counts must be interactive → Financial catalog.
          href={financialCatHref}
        />
        <V3KpiTile
          testId="reports-kpi-schedules"
          label="Custom schedules"
          value={loading && !kpiReady ? "…" : dash(kpiQuery.data?.scheduled)}
          sub={kpiReady ? "auto-emailed" : kpiQuery.isError ? "Failed to load" : "Loading…"}
          href={scheduledHref}
        />
        <V3KpiTile
          testId="reports-kpi-run-7d"
          label="Run last 7 days"
          value={loading && !kpiReady ? "…" : dash(kpiQuery.data?.run_last_7d)}
          sub={kpiReady ? "across all users" : kpiQuery.isError ? "Failed to load" : "Loading…"}
          // ROUND 8.20 board25 — run count → Saved / Frequently run cohort.
          href={savedCatHref}
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
          href={iftaHref}
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
                title="Accounting & financial"
                subtitle="Core accounting statements plus operational finance views"
                onViewAll={() => setShowAll((v) => !v)}
                viewAllLabel={showAll ? "Show primary →" : "View all →"}
                headerRight={<BasisSelector value={basis} onChange={setBasis} />}
                testId="reports-home-accounting-financial"
              >
                <div style={{ overflowX: "auto" }}>
                  <ParityTable<(typeof accountingRows)[number]>
                    tableTestId="reports-accounting-financial-table"
                    storageKey="ih35.reports.home.accounting-financial.v1"
                    appearance="board"
                    hidePager
                    density="compact"
                    suppressToolbarSearch
                    suppressToolbarRange
                    rows={[...accountingRows]}
                    rowKey={([reportKey]) => reportKey}
                    rowTestId={([reportKey]) => `reports-acct-row-${reportKey}`}
                    emptyText="No reports."
                    columns={accountingColumns}
                  />
                </div>
                <p className="px-3 py-2 text-xs" style={{ color: V3.muted, borderTop: `1px solid ${V3.borderSoft}` }}>
                  Report name or Run → opens the live report viewer (dates, basis, search, columns — edit and re-run). PDF · XLSX export exactly what the viewer shows with the filters applied.
                </p>
              </V3Panel>

            </>
          ) : activeCategory === "automation" ? (
            <ScheduledReportsPanel />
          ) : activeCategory === "saved" ? (
            /* Rule 07 — Frequently run stays reachable on the board: the Saved category (row 53 — not stacked below). */
            <V3Panel
              title="Saved"
              subtitle="Your most-run reports — run counts from the report log"
              testId="reports-category-panel-saved"
            >
              <div data-testid="reports-home-frequently-run">
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
              </div>
              <p className="px-3 py-2 text-xs text-[#4B5563]" style={{ borderTop: `1px solid ${V3.borderSoft}` }}>
                Build and save your own reports in the{" "}
                <Link to={moneyHref("/reports/custom")} className="font-semibold text-blue-700 hover:underline" data-testid="reports-saved-builder-link">
                  report builder →
                </Link>
              </p>
            </V3Panel>
          ) : activeCategory === "compliance" ? (
            <div className="space-y-3">
              <SimpleCategoryPanel category="compliance" rows={SIMPLE_CATEGORY_ROWS.compliance ?? []} />
              {/* IFTA preparer (S05) — reached from the IFTA due tile and here; drawn only once the real status loads. */}
              {iftaQuery.data ? <IftaPreparerCard status={iftaQuery.data} /> : null}
            </div>
          ) : (
            /* Simple report table for other categories */
            <SimpleCategoryPanel category={activeCategory} rows={SIMPLE_CATEGORY_ROWS[activeCategory] ?? []} />
          )}
        </div>
      </div>

    </div>
  );
}

function SimpleCategoryPanel({
  category,
  rows,
}: {
  category: SidebarCategory;
  rows: { id: string; label: string; shows: string }[];
}) {
  const label = SIDEBAR_CATEGORIES.find((c) => c.id === category)?.label ?? category;
  return (
    <V3Panel title={label} testId={`reports-category-panel-${category}`}>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-[#6B7280]">No reports in this category yet.</div>
      ) : (
        <ParityTable<{ id: string; label: string; shows: string }>
          tableTestId={`reports-category-table-${category}`}
          storageKey={`ih35.reports.home.category.${category}.v1`}
          appearance="board"
          hidePager
          density="compact"
          suppressToolbarSearch
          suppressToolbarRange
          rows={rows}
          rowKey={(r) => r.id}
          emptyText="No reports in this category yet."
          columns={[
            {
              key: "report",
              label: "Report",
              sortable: true,
              sortValue: (r) => r.label,
              render: (r) => (
                <CatalogLink href={PHASE_6_REPORT_HREFS[r.id] ?? null} testId={`reports-category-link-${r.id}`}>
                  {r.label}
                </CatalogLink>
              ),
            },
            { key: "shows", label: "What it shows", sortable: true, sortValue: (r) => r.shows, render: (r) => <span style={{ color: V3.muted }}>{r.shows}</span> },
            {
              key: "run",
              label: "Run",
              sortable: true,
              sortValue: (r) => r.label,
              render: (r) => (
                <CatalogLink href={PHASE_6_REPORT_HREFS[r.id] ?? null} testId={`reports-category-run-${r.id}`}>
                  Run →
                </CatalogLink>
              ),
            },
          ]}
        />
      )}
    </V3Panel>
  );
}
