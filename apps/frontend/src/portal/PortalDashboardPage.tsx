import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { ListErrorState } from "../components/ListErrorState";
import { StatusBadge } from "../components/layout/StatusBadge";
import { ParityTable, type ParityColumn } from "../components/parity/ParityTable";
import { EntityLink } from "../components/shared/EntityLink";

type PortalLoadRow = {
  id: string;
  load_number: string;
  status: string;
  pickup_city: string | null;
  pickup_state: string | null;
  delivery_city: string | null;
  delivery_state: string | null;
  progress_status: string | null;
};

function formatRoute(load: PortalLoadRow): string {
  const pickup = [load.pickup_city, load.pickup_state].filter(Boolean).join(", ");
  const delivery = [load.delivery_city, load.delivery_state].filter(Boolean).join(", ");
  return `${pickup} → ${delivery}`;
}

const COLUMNS: Array<ParityColumn<PortalLoadRow>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (load) => (
      <EntityLink
        kind="portal_load"
        id={load.id}
        label={load.load_number}
        className="font-medium text-slate-700 hover:underline"
      />
    ),
  },
  {
    key: "route",
    label: "Route",
    sortable: true,
    sortValue: (load) => formatRoute(load),
    render: (load) => <span className="text-slate-700">{formatRoute(load)}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (load) => <span className="capitalize">{load.status.replace(/_/g, " ")}</span>,
  },
  {
    key: "progress_status",
    label: "Progress",
    sortable: true,
    render: (load) => <StatusBadge variant="neutral">{load.progress_status ?? "unknown"}</StatusBadge>,
  },
];

export function PortalDashboardPage() {
  const loadsQuery = useQuery({
    queryKey: ["portal", "loads"],
    queryFn: () => apiRequest<{ loads: PortalLoadRow[] }>("/api/v1/portal/loads").then((r) => r.loads),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-page-title font-semibold text-slate-900">Your loads</h1>
        <p className="text-xs text-slate-600">Active and recent shipments for your account.</p>
      </div>

      {loadsQuery.isError ? (
        <ListErrorState
          title="Couldn't load shipments"
          status={0}
          message={(loadsQuery.error as Error)?.message}
          onRetry={() => void loadsQuery.refetch()}
        />
      ) : (
        <ParityTable<PortalLoadRow>
          rows={loadsQuery.data ?? []}
          columns={COLUMNS}
          rowKey={(load) => load.id}
          loading={loadsQuery.isLoading}
          storageKey="portal-dashboard-loads"
          exportFilename="portal-loads"
          emptyText="No loads to display yet."
          tableTestId="portal-dashboard-loads-table"
        />
      )}
    </div>
  );
}
