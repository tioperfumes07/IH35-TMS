import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateUS } from "../../../lib/formatDate";
import { Link } from "react-router-dom";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";

type PendingRequestRow = Record<string, unknown>;

export function DriverSchedulerRequestInboxPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["driver-scheduler", "pending", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.listPending(operatingCompanyId),
  });

  const rows = query.data?.requests ?? [];

  const columns = useMemo<ParityColumn<PendingRequestRow>[]>(
    () => [
      { key: "request_number", label: "Request", sortable: true, className: "font-mono", cellClass: "font-mono", render: (r) => String(r.request_number) },
      { key: "driver_name", label: "Driver", sortable: true, render: (r) => <EntityLink kind="driver" id={String(r.driver_id ?? "")} label={String(r.driver_name ?? "Driver")} /> },
      { key: "leave_type", label: "Type", sortable: true, render: (r) => String(r.leave_type) },
      {
        key: "dates",
        label: "Dates",
        render: (r) => (
          <>
            {formatDateUS(String(r.start_date))} – {formatDateUS(String(r.end_date))}
          </>
        ),
      },
      {
        key: "review",
        label: "",
        render: (r) => (
          <Link to={`/safety/scheduler/requests/${String(r.id)}`}>
            <Button size="sm" variant="secondary">
              Review
            </Button>
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader title="Leave Requests" subtitle="Pending time-off requests awaiting review" />
      {!operatingCompanyId ? <div className="text-sm text-gray-500">Select an operating company to view leave requests.</div> : null}
      <div className="mb-2">
        <Link to="/safety/driver-scheduler" className="text-xs text-slate-700 hover:underline">
          ← Back to Driver Scheduler grid
        </Link>
      </div>

      {query.isError ? <div className="text-sm text-red-700">Could not load pending requests.</div> : null}

      <ParityTable<PendingRequestRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={query.isLoading}
        emptyText="No pending leave requests."
        storageKey="safety-driver-scheduler-pending"
        exportFilename="driver-scheduler-pending-requests"
      />
    </div>
  );
}
