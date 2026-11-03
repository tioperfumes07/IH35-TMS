import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCustomerProfitability, type CustomerProfitabilityRow } from "../../api/reports";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { ByTypeView } from "./ByTypeView";
import { money, pctLabel } from "./money";

interface ByCustomerViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
  };
}

export function ByCustomerView({ filters }: ByCustomerViewProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  // Codex batch58 — equipment filter scopes By Type + KPIs on the same population.
  // When Equipment is set, this tab renders the filtered By Type aggregate (not a blanked feed).
  if (filters.equipmentType) {
    return <ByTypeView filters={filters} />;
  }



  const query = useQuery({
    queryKey: ["profitability", "by-customer", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
    queryFn: () =>
      getCustomerProfitability({
        operating_company_id: companyId,
        period_start: filters.dateFrom,
        period_end: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo),
    retry: false,
  });

  const columns = useMemo<Array<ParityColumn<CustomerProfitabilityRow>>>(
    () => [
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        alwaysVisible: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="customer" id={row.customer_id} name={row.customer_name} noun="Customer" />
        ),
      },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      {
        key: "avg_revenue_per_load_cents",
        label: "Avg Rev/Load",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => money(row.avg_revenue_per_load_cents),
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
        key: "direct_cost_cents",
        label: "Direct Cost",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => money(row.direct_cost_cents),
      },
      {
        key: "gross_margin_pct",
        label: "Margin %",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => pctLabel(row.gross_margin_pct),
      },
      {
        key: "gross_margin_cents",
        label: "Total Margin",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => money(row.gross_margin_cents),
      },
    ],
    []
  );

  if (!companyId) {
    return (
      <BoardSection title="By Customer" testId="profitability-by-customer-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to load customer profitability.</p>
      </BoardSection>
    );
  }

  return (
    <BoardSection
      title="By Customer"
      subtitle={`${filters.dateFrom} → ${filters.dateTo}`}
      testId="profitability-by-customer-board"
      onViewAll={() => {
        window.location.assign("/reports/customer-profitability");
      }}
      viewAllLabel="Full report →"
    >
      <div className="p-4 space-y-3">
        {query.isError ? (
          <ListErrorBanner
            message={userFacingApiError(query.error, "Could not load customer profitability")}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        <ParityTable<CustomerProfitabilityRow>
          columns={columns}
          rows={query.data?.by_customer ?? []}
          rowKey={(row) => row.customer_id}
          storageKey="profitability-by-customer"
          tableTestId="profitability-by-customer-table"
          emptyText={
            query.isLoading
              ? "Loading customer profitability…"
              : "No customers with profitability in this period."
          }
        />
      </div>
    </BoardSection>
  );
}
