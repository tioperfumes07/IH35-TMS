import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTripProfitability, type TripProfitabilityRow } from "../../lib/loadProfit";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { money, pctLabel } from "./money";

interface ByLoadViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
    laneKey?: string;
  };
}

export function ByLoadView({ filters }: ByLoadViewProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["profitability", "by-load", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
    queryFn: () =>
      getTripProfitability({
        operating_company_id: companyId,
        from: filters.dateFrom,
        to: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo),
    retry: false,
  });

  const columns = useMemo<Array<ParityColumn<TripProfitabilityRow>>>(
    () => [
      {
        key: "first_load_number",
        label: "Load",
        sortable: true,
        alwaysVisible: true,
        render: (row) =>
          row.first_load_id ? (
            <EntityLinkOrTombstone
              kind="load"
              id={row.first_load_id}
              name={row.first_load_number}
              noun="Load"
            />
          ) : (
            "—"
          ),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) =>
          row.driver_id ? (
            <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
          ) : (
            "—"
          ),
      },
      {
        key: "settlement_display_id",
        label: "Settlement",
        sortable: true,
        render: (row) =>
          row.settlement_id ? (
            <EntityLinkOrTombstone
              kind="settlement"
              id={row.settlement_id}
              name={row.settlement_display_id}
              noun="Settlement"
            />
          ) : (
            "—"
          ),
      },
      {
        key: "revenue_cents",
        label: "Revenue",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => money(row.revenue_cents),
      },
      {
        key: "cost",
        label: "Cost",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) =>
          money(
            row.driver_pay_cents +
              row.additional_driver_pay_cents +
              row.fuel_cents +
              row.company_expenses_cents
          ),
      },
      {
        key: "net_profit_cents",
        label: "Margin",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => money(row.net_profit_cents),
      },
      {
        key: "margin_pct",
        label: "Margin %",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => pctLabel(row.margin_pct),
      },
    ],
    []
  );

  if (!companyId) {
    return (
      <BoardSection title="By Load (trip / settlement detail)" testId="profitability-by-load-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to load trip profitability.</p>
      </BoardSection>
    );
  }

  return (
    <BoardSection
      title="By Load (trip / settlement detail)"
      subtitle={`${filters.dateFrom} → ${filters.dateTo} · trip-profitability engine`}
      testId="profitability-by-load-board"
      onViewAll={() => {
        window.location.assign("/reports/trip-profitability");
      }}
      viewAllLabel="Full trip P&L →"
    >
      <div className="p-4 space-y-3">
        {query.isError ? (
          <ListErrorBanner
            message={userFacingApiError(query.error, "Could not load trip profitability")}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        <ParityTable<TripProfitabilityRow>
          columns={columns}
          rows={filters.equipmentType ? [] : (query.data?.rows ?? [])}
          rowKey={(row) => row.settlement_id}
          storageKey="profitability-by-load"
          tableTestId="profitability-by-load-table"
          emptyText={
            query.isLoading
              ? "Loading trip profitability…"
              : filters.equipmentType
                ? "Load view has no equipment dimension — clear Equipment or open By Type."
                : "No settlements with trip profitability in this period."
          }
        />
      </div>
    </BoardSection>
  );
}
