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
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";

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
      { key: "driver_name", label: "Driver", sortable: true, render: (r) => <EntityLinkOrTombstone kind="driver" id={String(r.driver_id ?? "")} name={r.driver_name} noun="Driver" /> },
      { key: "leave_type", label: "Type", sortable: true, render: (r) => humanizeEnumLabel(r.leave_type) },
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
          <EntityLink
            kind="scheduler_request"
            id={String(r.id)}
            label={
              <Button size="sm" variant="secondary">
                Review
              </Button>
            }
          />
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

      {query.isError ? (
        <ListErrorState
          title="Couldn't load pending leave requests"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {!query.isError ? (
      <ParityTable<PendingRequestRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.id)}
        loading={query.isLoading}
        emptyText="No pending leave requests."
        storageKey="safety-driver-scheduler-pending"
        exportFilename="driver-scheduler-pending-requests"
      />
      ) : null}
    </div>
  );
}
