import { useQuery } from "@tanstack/react-query";
import { DrillKpiCard } from "../../components/layout/DrillKpiCard";
import { getEquipmentTypeProfitability, getLaneProfitability } from "../../api/reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { money, milesLabel, perMile } from "./money";
import { matchesEquipmentType } from "./equipmentFilter";
import { formatQuantityTable } from "../../lib/money";

interface KpiStripProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
  };
}

/**
 * Profitability KPI strip — wired to the lane-profitability engine totals for the selected period.
 */
export function KpiStrip({ filters }: KpiStripProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const useEquipment = Boolean(filters.equipmentType);
  const laneQuery = useQuery({
    queryKey: ["profitability", "kpi", "lane", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
    queryFn: () =>
      getLaneProfitability({
        operating_company_id: companyId,
        period: "custom",
        start: filters.dateFrom,
        end: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo) && !useEquipment,
    retry: false,
  });
  const typeQuery = useQuery({
    queryKey: ["profitability", "kpi", "type", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
    queryFn: () =>
      getEquipmentTypeProfitability({
        operating_company_id: companyId,
        period_start: filters.dateFrom,
        period_end: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo) && useEquipment,
    retry: false,
  });
  const query = useEquipment ? typeQuery : laneQuery;

  const ready = Boolean(query.data) && !query.isError;
  let totalMiles: number | null = null;
  let totalCost: number | null = null;
  let revenue: number | null = null;
  let margin: number | null = null;
  let loads: number | null = null;
  if (ready && useEquipment && typeQuery.data) {
    const rows = typeQuery.data.by_type.filter(
      (row) =>
        matchesEquipmentType(filters.equipmentType, row.equipment_code) ||
        matchesEquipmentType(filters.equipmentType, row.equipment_label),
    );
    totalMiles = 0;
    totalCost = 0;
    revenue = 0;
    margin = 0;
    loads = 0;
    for (const row of rows) {
      totalMiles += row.miles;
      totalCost += row.direct_cost_cents;
      revenue += row.revenue_cents;
      margin += row.gross_margin_cents;
      loads += row.load_count;
    }
  } else if (ready && laneQuery.data) {
    const lanes = laneQuery.data.lanes ?? [];
    const totals = laneQuery.data.totals;
    totalMiles = 0;
    totalCost = 0;
    for (const l of lanes) {
      totalMiles += l.total_miles;
      totalCost += l.total_driver_pay_cents + l.total_fuel_cost_cents + l.total_maintenance_cost_cents;
    }
    revenue = totals?.total_revenue_cents ?? null;
    margin = totals?.gross_profit_cents ?? null;
    loads = totals?.load_count ?? null;
  }

  return (
    <div className="space-y-1" data-testid="profitability-kpi-strip">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <DrillKpiCard
          label="Total Revenue"
          value={ready ? money(revenue) : null}
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
        />
        <DrillKpiCard
          label="Total Miles"
          value={ready ? milesLabel(totalMiles) : null}
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
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
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
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
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
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
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
        />
        <DrillKpiCard
          label="Loads"
          value={ready ? (loads == null ? "—" : formatQuantityTable(loads, 0)) : null}
          to={useEquipment ? "/profitability?tab=type" : "/reports/lane-profitability"}
        />
      </div>
      <div className="text-right text-xs text-gray-400">
        {filters.dateFrom} — {filters.dateTo}
        {query.isError ? " · feed error (retry from a tab below)" : ""}
      </div>
    </div>
  );
}
