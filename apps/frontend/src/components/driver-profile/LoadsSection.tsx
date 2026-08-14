import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDispatchLoads, type DispatchLoad } from "../../api/dispatch";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { StatusBadge } from "../../components/StatusBadge";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

const LOAD_COLUMNS: Array<ParityColumn<DispatchLoad>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (row) => (
      <EntityLink kind="load" id={row.id} label={entityLabel(row.load_number, row.id, "Load")} />
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "customer",
    label: "Customer",
    sortable: true,
    sortValue: (row) => row.customer_name ?? "",
    render: (row) => (
      <EntityLink
        kind="customer"
        id={row.customer_id}
        label={entityLabel(row.customer_name, row.customer_id, "Customer")}
      />
    ),
  },
  {
    key: "origin",
    label: "Origin",
    sortable: true,
    sortValue: (row) => `${row.pickup_city ?? ""}, ${row.pickup_state ?? ""}`,
    render: (row) => (
      <span className="text-xs text-slate-700">
        {row.pickup_city ?? "—"}
        {row.pickup_state ? `, ${row.pickup_state}` : ""}
      </span>
    ),
  },
  {
    key: "destination",
    label: "Destination",
    sortable: true,
    sortValue: (row) => `${row.delivery_city ?? ""}, ${row.delivery_state ?? ""}`,
    render: (row) => (
      <span className="text-xs text-slate-700">
        {row.delivery_city ?? "—"}
        {row.delivery_state ? `, ${row.delivery_state}` : ""}
      </span>
    ),
  },
];

export function LoadsSection({ driverId, operatingCompanyId }: Props) {
  const query = useQuery({
    queryKey: ["driver-profile-loads", driverId, operatingCompanyId],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "loads",
        limit: 20,
        offset: 0,
        status: [],
        driver: driverId,
      }),
    enabled: Boolean(driverId && operatingCompanyId),
    staleTime: 60_000,
  });

  const rows = useMemo(() => query.data?.loads ?? [], [query.data?.loads]);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="dp-section-loads">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Loads</h2>
        <EntityLink kind="loads_driver_filter" id={driverId} label="Full load history" className="text-xs text-slate-700 underline" />
      </div>
      {query.isError ? (
        <div className="mt-3">
          <ListErrorBanner
            message="Failed to load recent loads"
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <div className="mt-3">
          <ParityTable
            storageKey="driver-profile-loads"
            tableTestId="driver-profile-loads-table"
            columns={LOAD_COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            emptyText="No loads found for this driver."
            initialPageSize={5}
            pageSizeOptions={[5, 10, 20]}
          />
        </div>
      )}
    </section>
  );
}
