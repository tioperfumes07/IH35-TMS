import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { listLoadsWithoutDriverBill, type ExceptionQueueLoadRow } from "../../api/reports";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

// D1 (owner law, 2026-09-13, "the exception queue BECOMES the navigation") — the detail behind the
// "Loads without a driver bill" chip. Non-cancelled loads with zero driver_finance.driver_bills
// rows, INCLUDING fully driverless orphans (deliberately broader than
// /api/v1/mdata/loads/needs-driver-bill-remint, which requires a seated driver since its own POST
// mints a bill). Read-only — no mint action here, this is visibility, not remediation.
export function LoadsWithoutDriverBillPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const loadsQ = useQuery({
    queryKey: ["reports", "loads-without-driver-bill", companyId],
    queryFn: () => listLoadsWithoutDriverBill(companyId),
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
    <div data-testid="loads-without-driver-bill-page" className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Loads without a driver bill"
        subtitle="Non-cancelled loads with zero driver_finance.driver_bills rows — including fully driverless orphans. Tile value equals this table's row count."
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
          emptyText="No loads without a driver bill."
          storageKey="reports-loads-without-driver-bill"
          exportFilename="loads-without-driver-bill"
          tableTestId="loads-without-driver-bill-table"
        />
      )}
      <p className="text-[11px] text-gray-500" data-testid="kpi-drill-row-count">
        {loads.length} loads — must match the "Loads without a driver bill" chip.
      </p>
    </div>
  );
}
