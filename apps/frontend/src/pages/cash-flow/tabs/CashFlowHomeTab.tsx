import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRollingLedger, type RollingLedgerResult } from "../../../api/cashFlow";
import { addDaysIso, companyToday } from "../../../lib/businessDate";
import { CashFlowKpiStrip, type CashFlowKpis } from "./CashFlowKpiStrip";
import type { CashFlowTabId } from "../CashFlowPage";

// REG-031 (owner live 2026-09-09, verbatim: "clicking Cash Flow in the left nav must land on a
// Cash Flow Home page first, with tabs used FROM there — not straight into a tab"). Before this,
// CashFlowPage.tsx defaulted straight into the "Projected (Auto)" tab on every landing — exactly
// the REG-022 FAIL pattern already recorded for Driver Finance/Settlements and Vendors/Customers
// (no Home tab, no KPI tile strip on the landing surface). MaintenanceHome.tsx is the owner-named
// REG-022 reference: module name at top (already rendered by CashFlowPage's own PageHeader on
// every tab) + a real KPI tile strip on the landing surface. This tab supplies that KPI strip
// (the SAME 8 tiles Rolling Ledger shows, computed from the SAME real endpoint — nothing
// invented) plus cards into each of the other tabs, so Home is the landing state and the
// functional tabs are reached FROM it, matching Dispatch's own Home-tab idiom (DispatchOverview
// links into its sibling views the same way).
//
// Deliberately independent of Rolling Ledger's own `kpis` (which reflects whatever filter the
// user last left active there) — Home always shows the TRUE, unfiltered totals for today, computed
// straight from `data.rows`/`data.days`.

const HOME_WINDOW_DAYS = 30;

function computeHomeKpis(data: RollingLedgerResult, today: string): CashFlowKpis {
  const todayDay = data.days.find((d) => d.date === today) ?? data.days[0];
  const rows = data.rows;
  const incomeNotFactored = rows.filter((r) => r.type === "Invoice").reduce((s, r) => s + r.amount_cents, 0);
  const dueNext10 = rows
    .filter((r) => r.row_kind === "income" && r.due_date >= today && r.due_date <= addDaysIso(today, 10))
    .reduce((s, r) => s + r.amount_cents, 0);
  return {
    opening: data.opening_cash_cents,
    incomeToday: todayDay?.income_due_cents ?? 0,
    expensesToday: todayDay?.expenses_due_cents ?? 0,
    carriedOver: (todayDay?.income_carry_over_cents ?? 0) + (todayDay?.expenses_carry_over_cents ?? 0),
    netToday: todayDay?.net_cents ?? 0,
    projectedClosing: todayDay?.running_cash_cents ?? null,
    incomeNotFactored,
    dueNext10,
  };
}

type TabLinkCard = {
  id: Exclude<CashFlowTabId, "home">;
  label: string;
  description: string;
};

const TAB_CARDS: TabLinkCard[] = [
  { id: "daily_prediction", label: "Projected (Auto)", description: "Today's automatic income and expense projection." },
  { id: "actual_vs_projected", label: "Actual vs Projected", description: "Compare what actually cleared against what was projected." },
  { id: "rolling_ledger", label: "Rolling Ledger", description: "The full day-by-day expected income and expense register, with roll-over." },
  { id: "manual_daily_projections", label: "Manual Daily Projections", description: "Hand-entered daily projections, when enabled." },
];

export function CashFlowHomeTab({
  operatingCompanyId,
  onNavigateToTab,
  showManualProjections,
}: {
  operatingCompanyId: string;
  onNavigateToTab: (tab: Exclude<CashFlowTabId, "home">) => void;
  showManualProjections: boolean;
}) {
  const today = companyToday();
  const windowEnd = useMemo(() => addDaysIso(today, HOME_WINDOW_DAYS), [today]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["cash-flow-home-kpis", operatingCompanyId, today, windowEnd],
    queryFn: () => getRollingLedger(operatingCompanyId, today, windowEnd),
    enabled: Boolean(operatingCompanyId),
  });

  const kpis = useMemo(() => (data ? computeHomeKpis(data, today) : null), [data, today]);
  const cards = TAB_CARDS.filter((c) => c.id !== "manual_daily_projections" || showManualProjections);

  return (
    <div className="space-y-4" data-testid="cash-flow-home-tab">
      {isError && (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-6 text-center text-xs text-slate-700">
          Failed to load today's cash position. Please try again.
        </div>
      )}

      {isLoading && !data && (
        <div className="rounded-sm border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">Loading…</div>
      )}

      {kpis && <CashFlowKpiStrip kpis={kpis} testId="cash-flow-home-kpi-strip" />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="cash-flow-home-tab-cards">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onNavigateToTab(card.id)}
            className="rounded-sm border border-slate-200 bg-white p-3 text-left transition hover:border-slate-400 hover:shadow-xs"
            data-testid={`cash-flow-home-card-${card.id}`}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-slate-700">{card.label}</div>
            <div className="mt-1 text-xs text-slate-500">{card.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
