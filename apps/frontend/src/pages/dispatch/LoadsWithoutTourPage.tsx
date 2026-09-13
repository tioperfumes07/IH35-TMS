import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { listLoadsWithoutTour, type ExceptionQueueLoadRow } from "../../api/reports";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

// D1 (owner law, 2026-09-13, "the exception queue BECOMES the navigation") — the detail behind the
// "Loads without a tour" chip. "No tour" = mdata.loads.presettlement_link_id IS NULL — the same
// predicate the load-to-cash chain law names for Chain Link 2. tour_id is deliberately NOT also
// checked: a load can carry a tour_id while still lacking the presettlement link that is the
// actual settlement anchor. Read-only — no auto-link action here, this is visibility only.
export function LoadsWithoutTourPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const loadsQ = useQuery({
    queryKey: ["reports", "loads-without-tour", companyId],
    queryFn: () => listLoadsWithoutTour(companyId),
    enabled: Boolean(companyId),
  });

  const loads = loadsQ.data?.loads ?? [];

  const columns = useMemo<ParityColumn<ExceptionQueueLoadRow>[]>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        sortable: true,
        render: (row) => <EntityLinkOrTombstone kind="load" id={row.id} name={row.load_number} noun="Load" />,
      },
      { key: "status", label: "Status", sortable: true, render: (row) => <StatusBadge status={row.status} /> },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) =>
          row.driver_id ? (
            <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
          ) : (
            <span className="text-gray-400" title="No driver assigned">
              No driver
            </span>
          ),
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) =>
          row.unit_id ? (
            <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
          ) : (
            <span className="text-gray-400">No unit</span>
          ),
      },
    ],
    [],
  );

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  return (
    <div data-testid="loads-without-tour-page" className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Loads without a tour"
        subtitle="Non-cancelled loads with presettlement_link_id IS NULL. Tile value equals this table's row count."
        actions={
          <Link to="/" className="rounded-sm border px-3 py-1.5 text-xs">
            Home
          </Link>
        }
      />

      {loadsQ.isError ? (
        <ListErrorState
          title="Couldn't load the exception queue"
          status={0}
          message={(loadsQ.error as Error)?.message}
          onRetry={() => void loadsQ.refetch()}
        />
      ) : (
        <ParityTable<ExceptionQueueLoadRow>
          columns={columns}
          rows={loads}
          rowKey={(row) => row.id}
          loading={loadsQ.isLoading}
          emptyText="No loads without a tour."
          storageKey="reports-loads-without-tour"
          exportFilename="loads-without-tour"
          tableTestId="loads-without-tour-table"
        />
      )}
      <p className="text-[11px] text-gray-500" data-testid="kpi-drill-row-count">
        {loads.length} loads — must match the "Loads without a tour" chip.
      </p>
    </div>
  );
}
