import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLaneProfitability, type LaneProfitabilityLane } from "../../api/reports";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { money, milesLabel, perMile } from "./money";

interface ByLaneViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
  };
}

function laneKey(lane: LaneProfitabilityLane): string {
  return `${lane.origin_city}|${lane.origin_state}|${lane.destination_city}|${lane.destination_state}`;
}

export function ByLaneView({ filters }: ByLaneViewProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["profitability", "by-lane", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
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

  const columns = useMemo<Array<ParityColumn<LaneProfitabilityLane>>>(
    () => [
      {
        key: "lane",
        label: "Lane",
        sortable: true,
        alwaysVisible: true,
        render: (lane) =>
          `${lane.origin_city}, ${lane.origin_state} → ${lane.destination_city}, ${lane.destination_state}`,
      },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      {
        key: "total_miles",
        label: "Miles",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => milesLabel(lane.total_miles),
      },
      {
        key: "rev",
        label: "Rev/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) =>
          perMile(lane.total_miles > 0 ? Math.round(lane.total_revenue_cents / lane.total_miles) : null),
      },
      {
        key: "cost",
        label: "Cost/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => {
          const cost =
            lane.total_driver_pay_cents + lane.total_fuel_cost_cents + lane.total_maintenance_cost_cents;
          return perMile(lane.total_miles > 0 ? Math.round(cost / lane.total_miles) : null);
        },
      },
      {
        key: "margin_mi",
        label: "Margin/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => perMile(lane.profit_per_mile_cents),
      },
      {
        key: "gross_profit_cents",
        label: "Total Margin",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (lane) => money(lane.gross_profit_cents),
      },
    ],
    []
  );

  if (!companyId) {
    return (
      <BoardSection title="By Lane" testId="profitability-by-lane-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to load lane profitability.</p>
      </BoardSection>
    );
  }

  return (
    <BoardSection
      title="By Lane"
      subtitle={`${filters.dateFrom} → ${filters.dateTo}${query.data?.source ? ` · ${query.data.source}` : ""}`}
      testId="profitability-by-lane-board"
    >
      <div className="p-4 space-y-3">
        {query.isError ? (
          <ListErrorBanner
            message={userFacingApiError(query.error, "Could not load lane profitability")}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        <ParityTable<LaneProfitabilityLane>
          columns={columns}
          rows={filters.equipmentType ? [] : (query.data?.lanes ?? [])}
          rowKey={laneKey}
          storageKey="profitability-by-lane"
          tableTestId="profitability-by-lane-table"
          emptyText={
            query.isLoading
              ? "Loading lane profitability…"
              : filters.equipmentType
                ? "Lane view has no equipment dimension — clear Equipment or open By Type."
                : "No lanes in this period — delivered loads with origin/destination will appear here."
          }
        />
      </div>
    </BoardSection>
  );
}
