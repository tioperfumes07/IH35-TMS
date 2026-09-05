import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

type PerTruckCpmRow = {
  unit_uuid: string;
  display_id: string;
  miles: number;
  total_cost_cents: number;
  cpm_cents: number;
  rank: number;
  outlier?: boolean;
};

type PerTruckCpmResponse = {
  operating_company_id: string;
  period: { from: string; to: string };
  fleet_median_cpm_cents: number;
  rows: PerTruckCpmRow[];
};

import { formatUsdCents } from "../../lib/money";

// GLB-05 -- delegates to the canonical formatter instead of reimplementing an identical
// local currency formatter (same shape lib/money.ts already covers).
function money(cents: number) {
  if (!cents) return "—";
  return formatUsdCents(cents);
}

function currentQuarterRange() {
  const now = new Date();
  const q = Math.floor(now.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 3, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function PerTruckCpmReport() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const defaultRange = currentQuarterRange();
  const [applied, setApplied] = useState({ ...defaultRange, minMiles: "" });
  const staged = useStagedListFilters({
    applied,
    empty: { ...defaultRange, minMiles: "" },
    onApply: setApplied,
  });

  const query = useQuery({
    queryKey: ["reports", "per-truck-cpm", companyId, applied.from, applied.to],
    enabled: Boolean(companyId),
    queryFn: () =>
      apiRequest<PerTruckCpmResponse>(
        `/api/v1/reports/per-truck-cpm?operating_company_id=${encodeURIComponent(companyId)}&from=${applied.from}&to=${applied.to}`
      ),
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);

  const columns = useMemo<ParityColumn<PerTruckCpmRow>[]>(
    () => [
      { key: "rank", label: "Rank", sortable: true },
      { key: "display_id", label: "Unit", sortable: true, render: (row) => <EntityLink kind="unit" id={row.unit_uuid} label={entityLabel(row.display_id, row.unit_uuid, "Unit")} /> },
      { key: "miles", label: "Miles", sortable: true, render: (row) => row.miles.toLocaleString() },
      { key: "total_cost_cents", label: "Total cost", sortable: true, render: (row) => money(row.total_cost_cents) },
      { key: "cpm_cents", label: "CPM", sortable: true, render: (row) => `${money(row.cpm_cents)}/mi` },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Per-truck CPM"
        subtitle="Cost per mile by unit (GAP-45)"
        backHref="/reports"
        breadcrumb={["Reports", "Per-Truck CPM"]}
      />
      <ReportsSubNav />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Print
        </button>
      </div>
      <CollapsedListFilters
        activeFilterCount={JSON.stringify(applied) !== JSON.stringify({ ...defaultRange, minMiles: "" }) ? 1 : 0}
        defaultOpen={true}
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="reports-per-truck-cpm"
        className="rounded-sm border bg-white p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            From
            <DatePicker className="ml-2" value={staged.draft.from} onChange={(next) => staged.setDraft((p) => ({ ...p, from: next }))} />
          </label>
          <label className="text-xs">
            To
            <DatePicker className="ml-2" value={staged.draft.to} onChange={(next) => staged.setDraft((p) => ({ ...p, to: next }))} />
          </label>
          <label className="text-xs">
            Min miles
            <input
              type="number"
              min={0}
              className="ml-2 h-9 w-28 rounded-sm border border-gray-300 px-2 text-xs"
              value={staged.draft.minMiles}
              onChange={(e) => staged.setDraft((p) => ({ ...p, minMiles: e.target.value }))}
              data-testid="reports-per-truck-cpm-min-miles"
              // TODO: wire to backend filter
            />
          </label>
        </div>
      </CollapsedListFilters>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load per-truck CPM"
          status={0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.unit_uuid}
          loading={query.isPending || (query.isFetching && rows.length === 0)}
          storageKey="per-truck-cpm"
          emptyText="No units with CPM data for this period."
          exportFilename="per-truck-cpm-report.csv"
          rowClassName={(row) => (row.outlier ? "bg-rose-50 text-rose-900" : "")}
        />
      )}
    </div>
  );
}

export default PerTruckCpmReport;
