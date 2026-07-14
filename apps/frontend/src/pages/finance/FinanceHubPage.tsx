import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FINANCE_HUB_UI_FLAG, getFinanceHubOverview, type FinanceHubKpi } from "../../api/financeHub";
import { formatUsdCents } from "../../lib/money";

// AF-6 — Finance Hub landing dashboard.
// READ-ONLY: a single GET aggregates headline KPIs from the existing read-only finance/accounting
// surfaces; every card drills through to the real screen that owns that data. Nothing here posts,
// writes, or moves money. Gated behind flag FINANCE_HUB_UI_ENABLED in lib.feature_flags — default OFF,
// per-entity-only (owner enables one operating company at a time via an override; a global default can
// never turn it on). The SAME DB flag gates the backend (via isEnabled), so UI and API stay in lockstep.

const fmtCents = (c: number) => formatUsdCents(c);

function kpiDisplay(kpi: FinanceHubKpi): string {
  if (kpi.value_kind === "money_cents") return fmtCents(Number(kpi.value) || 0);
  if (kpi.value_kind === "count") return new Intl.NumberFormat("en-US").format(Number(kpi.value) || 0);
  return String(kpi.value ?? "—");
}

// B10 dead-click rollout: the whole card is now the clickable region (was only the "drill" footer link
// before) — `kpi.drill_to` is the same real, existing drill-down route the footer link already used.
function KpiCard({ kpi, to }: { kpi: FinanceHubKpi; to: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col justify-between rounded-sm border border-slate-200 bg-white p-4 transition hover:shadow-xs"
    >
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{kpiDisplay(kpi)}</div>
        {kpi.secondary ? <div className="mt-1 text-xs text-slate-500">{kpi.secondary}</div> : null}
      </div>
      <div className="mt-4 text-sm font-medium text-slate-700 underline-offset-2">{kpi.drill_label} →</div>
    </Link>
  );
}

export function FinanceHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_UI_FLAG, companyId);

  const active = enabled && Boolean(companyId);

  const overviewQuery = useQuery({
    queryKey: ["af6-finance-hub", companyId],
    queryFn: () => getFinanceHubOverview({ operating_company_id: companyId }),
    enabled: active,
    retry: false,
  });

  const header = (
    <PageHeader
      backHref="/finance"
      title="Finance Hub"
      subtitle="Finance · Hub — read-only overview, nothing is posted"
    />
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          The Finance Hub is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_UI_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      {header}

      {!companyId ? <p className="mb-3 text-sm text-red-600">Select an operating company.</p> : null}

      {overviewQuery.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
      {overviewQuery.isError ? <p className="text-sm text-red-600">Could not load the Finance Hub overview.</p> : null}

      {overviewQuery.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {overviewQuery.data.kpis.map((kpi) => (
              <KpiCard key={kpi.key} kpi={kpi} to={kpi.drill_to} />
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Read-only. Figures are aggregated from the existing finance and accounting screens — nothing is posted here.
          </p>
        </>
      ) : null}
    </div>
  );
}
