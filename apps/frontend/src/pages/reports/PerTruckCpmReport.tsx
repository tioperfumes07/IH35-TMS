import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ReportsSubNav } from "./ReportsSubNav";
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

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
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
  const [period, setPeriod] = useState(currentQuarterRange);
  const [applied, setApplied] = useState(currentQuarterRange);

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
      <div className="flex flex-wrap items-end gap-3 rounded-sm border bg-white p-4">
        <label className="text-sm">
          From
          <DatePicker className="ml-2" value={period.from} onChange={(next) => setPeriod((p) => ({ ...p, from: next }))} />
        </label>
        <label className="text-sm">
          To
          <DatePicker className="ml-2" value={period.to} onChange={(next) => setPeriod((p) => ({ ...p, to: next }))} />
        </label>
        <Button onClick={() => setApplied(period)}>Apply</Button>
      </div>
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
          rowClassName={(row) => (row.outlier ? "bg-rose-50 text-rose-900" : "")}
        />
      )}
    </div>
  );
}

export default PerTruckCpmReport;
