import { Link, useSearchParams } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { BoardSection } from "../../components/v3/BoardSection";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { DailyPredictionTab } from "./tabs/DailyPredictionTab";
import { ActualVsProjectedTab } from "./tabs/ActualVsProjectedTab";
import { ManualDailyProjectionsTab } from "./tabs/ManualDailyProjectionsTab";
import { RollingLedgerTab } from "./tabs/RollingLedgerTab";
import { CashFlowHomeTab } from "./tabs/CashFlowHomeTab";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { CASH_FORECAST_ENABLED_FLAG } from "../../api/forecast";

export type CashFlowTabId = "home" | "daily_prediction" | "actual_vs_projected" | "manual_daily_projections" | "rolling_ledger";

/** Optional Rolling Ledger URL provenance when Home matrix/KPI drills into a sibling tab. */
export type CashFlowNavOpts = {
  rl_from?: string;
  rl_to?: string;
  /** Comma-separated RollingLedger TYPE_OPTIONS values (e.g. "Invoice,Factor advance"). */
  rl_types?: string;
  rl_kind?: "income" | "expenses" | "all";
  /** Home Net/Ending drill — scenario + bucket kind + component cents for reconciliation banner. */
  rl_explain?: "net" | "ending";
  rl_scenario?: "base" | "conservative";
  rl_bucket?: "actual" | "forecast";
  rl_invoice?: string;
  rl_topup?: string;
  rl_finance?: string;
  rl_driver?: string;
  rl_diesel?: string;
  rl_vendor?: string;
  rl_other?: string;
  rl_income?: string;
  rl_expenses?: string;
  rl_net?: string;
  /** Home Ending drill — cumulative ending cash for the clicked week/month (not weekly net). */
  rl_ending?: string;
  /** Home Ending drill — opening = ending − net for that bucket (recon banner). */
  rl_opening?: string;
  /** Comma list of run-rate estimate legs: driver,diesel,other,topup. */
  rl_rr?: string;
};

const ALL_TAB_IDS = new Set<CashFlowTabId>([
  "home",
  "daily_prediction",
  "actual_vs_projected",
  "manual_daily_projections",
  "rolling_ledger",
]);

const RL_PARAM_KEYS = [
  "rl_from",
  "rl_to",
  "rl_types",
  "rl_kind",
  "rl_q",
  "rl_rolled",
  "rl_group",
  "rl_explain",
  "rl_scenario",
  "rl_bucket",
  "rl_invoice",
  "rl_topup",
  "rl_finance",
  "rl_driver",
  "rl_diesel",
  "rl_vendor",
  "rl_other",
  "rl_income",
  "rl_expenses",
  "rl_net",
  "rl_ending",
  "rl_opening",
  "rl_rr",
] as const;

// REG-031 (owner live 2026-09-09): landing on Cash Flow must show Home first, not a bare tab.
// Every OTHER cash-flow tab still keeps its own direct ?tab= deep link (unchanged) — only the
// no-param / unrecognized-param default moved from "daily_prediction" to "home".
function parseCashFlowTab(raw: string | null, allowManual: boolean): CashFlowTabId {
  if (raw && ALL_TAB_IDS.has(raw as CashFlowTabId)) {
    if (raw === "manual_daily_projections" && !allowManual) return "home";
    return raw as CashFlowTabId;
  }
  return "home";
}

export function CashFlowPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  // Block F: the hand-entered tab only appears once its OFF-by-default flag is on.
  const { enabled: manualForecastEnabled } = useFeatureFlag(CASH_FORECAST_ENABLED_FLAG, selectedCompanyId ?? undefined);
  const activeTab = parseCashFlowTab(searchParams.get("tab"), Boolean(manualForecastEnabled));
  const setActiveTab = (next: CashFlowTabId, opts?: CashFlowNavOpts) => {
    const params = new URLSearchParams(searchParams);
    if (next === "home") params.delete("tab");
    else params.set("tab", next);
    // Clear prior Rolling Ledger provenance on every tab change, then re-apply when Home drills
    // with an explicit week/type (Codex QA 11-02: invoice-week must not open "today").
    for (const key of RL_PARAM_KEYS) params.delete(key);
    if (opts?.rl_from) params.set("rl_from", opts.rl_from);
    if (opts?.rl_to) params.set("rl_to", opts.rl_to);
    if (opts?.rl_types) params.set("rl_types", opts.rl_types);
    if (opts?.rl_kind && opts.rl_kind !== "all") params.set("rl_kind", opts.rl_kind);
    if (opts?.rl_explain) params.set("rl_explain", opts.rl_explain);
    if (opts?.rl_scenario) params.set("rl_scenario", opts.rl_scenario);
    if (opts?.rl_bucket) params.set("rl_bucket", opts.rl_bucket);
    if (opts?.rl_invoice != null) params.set("rl_invoice", opts.rl_invoice);
    if (opts?.rl_topup != null) params.set("rl_topup", opts.rl_topup);
    if (opts?.rl_finance != null) params.set("rl_finance", opts.rl_finance);
    if (opts?.rl_driver != null) params.set("rl_driver", opts.rl_driver);
    if (opts?.rl_diesel != null) params.set("rl_diesel", opts.rl_diesel);
    if (opts?.rl_vendor != null) params.set("rl_vendor", opts.rl_vendor);
    if (opts?.rl_other != null) params.set("rl_other", opts.rl_other);
    if (opts?.rl_income != null) params.set("rl_income", opts.rl_income);
    if (opts?.rl_expenses != null) params.set("rl_expenses", opts.rl_expenses);
    if (opts?.rl_net != null) params.set("rl_net", opts.rl_net);
    if (opts?.rl_ending != null) params.set("rl_ending", opts.rl_ending);
    if (opts?.rl_opening != null) params.set("rl_opening", opts.rl_opening);
    if (opts?.rl_rr) params.set("rl_rr", opts.rl_rr);
    setSearchParams(params, { replace: true });
  };
  const TABS: { id: CashFlowTabId; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "daily_prediction", label: "Projected (Auto)" },
    { id: "actual_vs_projected", label: "Actual vs Projected" },
    { id: "rolling_ledger", label: "Rolling Ledger" },
    ...(manualForecastEnabled ? [{ id: "manual_daily_projections" as const, label: "Manual Daily Projections" }] : []),
  ];

  if (!selectedCompanyId) {
    return (
      <div className="space-y-4">
        <PageHeader backHref="/cash-flow" title="Cash Flow" subtitle="Daily cash position — predicted income and expenses" />
        <BoardSection title="Cash Flow" testId="cash-flow-need-company">
          <div className="px-3 py-6 text-center">
            <TrendingUp className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <p className="text-xs text-[#4B5563]">Select a company to view cash flow.</p>
          </div>
        </BoardSection>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4" data-testid="cash-flow-page" data-c06-page="cash-flow">
      <PageHeader
        backHref="/cash-flow"
        title="Cash Flow"
        subtitle="Forward-looking daily cash position — predicted income and expenses"
      />
      {/* ROUND 8.5 CF1 — Related links ABOVE the tab strip (CashFlow-*.dc.html order). */}
      <nav
        aria-label="Cash flow related modules"
        className="flex flex-wrap items-center gap-2 rounded-sm border border-[#E5E7EB] bg-white px-3 py-2 text-xs"
        data-testid="cash-flow-cross-module-links"
      >
        <span className="font-semibold text-[#6B7280]">Related:</span>
        <Link className="font-medium text-[#1F2A44] underline-offset-2 hover:underline" to="/banking">
          Banking
        </Link>
        <Link className="font-medium text-[#1F2A44] underline-offset-2 hover:underline" to="/reports/cash-flow-statement">
          Cash flow statement
        </Link>
        <Link className="font-medium text-[#1F2A44] underline-offset-2 hover:underline" to="/reports/cash-flow">
          Cash flow report
        </Link>
        <Link className="font-medium text-[#1F2A44] underline-offset-2 hover:underline" to="/reports/cash-flow-overview">
          Cash flow overview
        </Link>
        <Link className="font-medium text-[#1F2A44] underline-offset-2 hover:underline" to="/cash-advances">
          Cash advances
        </Link>
      </nav>
      <NavyPageSubNav
        items={TABS.map((t) => ({ label: t.label, to: `#${t.id}` }))}
        activeId={activeTab}
        onTabChange={(id) => setActiveTab(id as CashFlowTabId)}
        itemIds={TABS.map((t) => t.id)}
      />
      {activeTab === "home" && (
        <CashFlowHomeTab
          operatingCompanyId={selectedCompanyId}
          onNavigateToTab={setActiveTab}
          showManualProjections={Boolean(manualForecastEnabled)}
        />
      )}
      {activeTab === "daily_prediction" && (
        <DailyPredictionTab operatingCompanyId={selectedCompanyId} />
      )}
      {activeTab === "actual_vs_projected" && (
        <ActualVsProjectedTab operatingCompanyId={selectedCompanyId} />
      )}
      {activeTab === "rolling_ledger" && (
        <RollingLedgerTab operatingCompanyId={selectedCompanyId} />
      )}
      {activeTab === "manual_daily_projections" && manualForecastEnabled && (
        <ManualDailyProjectionsTab operatingCompanyId={selectedCompanyId} />
      )}
    </div>
  );
}
