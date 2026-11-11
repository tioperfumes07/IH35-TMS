import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getEquipmentTypeProfitability,
  type EquipmentTypeProfitabilityRow,
} from "../../api/reports";
import { BoardSection } from "../../components/v3/BoardSection";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { money, milesLabel, perMile } from "./money";
import { matchesEquipmentType } from "./equipmentFilter";

interface ByTypeViewProps {
  filters: {
    dateFrom: string;
    dateTo: string;
    equipmentType?: string;
    customerId?: string;
  };
}

export function ByTypeView({ filters }: ByTypeViewProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["profitability", "by-type", companyId, filters.dateFrom, filters.dateTo, filters.equipmentType],
    queryFn: () =>
      getEquipmentTypeProfitability({
        operating_company_id: companyId,
        period_start: filters.dateFrom,
        period_end: filters.dateTo,
      }),
    enabled: Boolean(companyId && filters.dateFrom && filters.dateTo),
    retry: false,
  });

  const columns = useMemo<Array<ParityColumn<EquipmentTypeProfitabilityRow>>>(
    () => [
      {
        key: "equipment_label",
        label: "Type",
        sortable: true,
        alwaysVisible: true,
        render: (row) => row.equipment_label || row.equipment_code,
      },
      { key: "load_count", label: "Loads", sortable: true, className: "text-right", cellClass: "text-right" },
      {
        key: "miles",
        label: "Miles",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => milesLabel(row.miles),
      },
      {
        key: "rev_per_mile_cents",
        label: "Rev/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => perMile(row.rev_per_mile_cents),
      },
      {
        key: "cost_per_mile_cents",
        label: "Cost/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => perMile(row.cost_per_mile_cents),
      },
      {
        key: "margin_per_mile_cents",
        label: "Margin/Mi",
        sortable: true,
        className: "text-right",
        cellClass: "text-right",
        render: (row) => perMile(row.margin_per_mile_cents),
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
      <BoardSection title="By Equipment Type" testId="profitability-by-type-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to load equipment-type profitability.</p>
      </BoardSection>
    );
  }

  return (
    <BoardSection
      title="By Equipment Type"
      subtitle={`${filters.dateFrom} → ${filters.dateTo} · load_trailer_equipment`}
      testId="profitability-by-type-board"
    >
      <div className="p-4 space-y-3">
        {query.isError ? (
          <ListErrorBanner
            message={userFacingApiError(query.error, "Could not load equipment-type profitability")}
            onRetry={() => void query.refetch()}
          />
        ) : null}
        <ParityTable<EquipmentTypeProfitabilityRow> appearance="board"
          columns={columns}
          rows={(query.data?.by_type ?? []).filter((row) => matchesEquipmentType(filters.equipmentType, row.equipment_code) || matchesEquipmentType(filters.equipmentType, row.equipment_label))}
          rowKey={(row) => row.equipment_code}
          storageKey="profitability-by-type"
          tableTestId="profitability-by-type-table"
          emptyText={
            query.isLoading
              ? "Loading equipment-type profitability…"
              : "No loads with a trailer equipment type in this period."
          }
        />
      </div>
    </BoardSection>
  );
}
