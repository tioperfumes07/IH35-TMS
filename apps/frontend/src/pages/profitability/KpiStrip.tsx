import { useQuery } from "@tanstack/react-query";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { getLaneProfitability } from "../../api/reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { money, milesLabel, perMile } from "./money";

interface KpiStripProps {
  filters: {
    dateFrom: string;
    dateTo: string;
  };
}

/**
 * Profitability KPI strip — wired to the lane-profitability engine totals for the selected period.
 */
export function KpiStrip({ filters }: KpiStripProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["profitability", "kpi", companyId, filters.dateFrom, filters.dateTo],
    queryFn: () =>
      getLaneProfitability({
        operating_company_id: companyId,
        period: "custom",
        start: filters.dateFrom,
        end: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo),
    retry: false,
  });

  const ready = Boolean(query.data) && !query.isError;
  const lanes = query.data?.lanes ?? [];
  const totals = query.data?.totals;

  let totalMiles: number | null = null;
  let totalCost: number | null = null;
  if (ready) {
    totalMiles = 0;
    totalCost = 0;
    for (const l of lanes) {
      totalMiles += l.total_miles;
      totalCost += l.total_driver_pay_cents + l.total_fuel_cost_cents + l.total_maintenance_cost_cents;
    }
  }

  const revenue = ready ? totals?.total_revenue_cents ?? null : null;
  const margin = ready ? totals?.gross_profit_cents ?? null : null;
  const loads = ready ? totals?.load_count ?? null : null;

  return (
    <div className="space-y-1" data-testid="profitability-kpi-strip">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <DrillKpiCard
          label="Total Revenue"
          value={ready ? money(revenue) : null}
          to="/reports/lane-profitability"
        />
        <DrillKpiCard
          label="Total Miles"
          value={ready ? milesLabel(totalMiles) : null}
          to="/reports/lane-profitability"
        />
        <DrillKpiCard
          label="Avg Rev/Mi"
          value={
            ready && totalMiles != null && totalMiles > 0 && revenue != null
              ? perMile(Math.round(revenue / totalMiles))
              : ready
                ? "—"
                : null
          }
          to="/reports/lane-profitability"
        />
        <DrillKpiCard
          label="Avg Cost/Mi"
          value={
            ready && totalMiles != null && totalMiles > 0 && totalCost != null
              ? perMile(Math.round(totalCost / totalMiles))
              : ready
                ? "—"
                : null
          }
          to="/reports/lane-profitability"
        />
        <DrillKpiCard
          label="Avg Margin/Mi"
          value={
            ready && totalMiles != null && totalMiles > 0 && margin != null
              ? perMile(Math.round(margin / totalMiles))
              : ready
                ? "—"
                : null
          }
          to="/reports/lane-profitability"
        />
        <DrillKpiCard
          label="Loads"
          value={ready ? (loads == null ? "—" : String(loads)) : null}
          to="/reports/lane-profitability"
        />
      </div>
      <div className="text-right text-xs text-gray-400">
        {filters.dateFrom} — {filters.dateTo}
        {query.isError ? " · feed error (retry from a tab below)" : ""}
      </div>
    </div>
  );
}
