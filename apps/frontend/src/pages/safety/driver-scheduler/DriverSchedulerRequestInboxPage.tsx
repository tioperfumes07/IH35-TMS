import { useEffect, useMemo, useState } from "react";
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
const PAGE_SIZE = 50;

export function DriverSchedulerRequestInboxPage({ embedded = false }: { embedded?: boolean } = {}) {
  // @matrix-built safety:leave_requests.list:{driver,connectivity,qbo_chrome}
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [operatingCompanyId]);

  const query = useQuery({
    queryKey: ["driver-scheduler", "pending", operatingCompanyId, page],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.listPending(operatingCompanyId, PAGE_SIZE, page * PAGE_SIZE),
  });

  const rows = query.data?.requests ?? [];
  const totalCount = query.data?.total_count ?? 0;

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
      {!embedded ? <PageHeader title="Leave Requests" subtitle="Pending time-off requests awaiting review" /> : null}
      {!operatingCompanyId ? <div className="text-sm text-gray-500">Select an operating company to view leave requests.</div> : null}
      {!embedded ? (
        <div className="mb-2">
          <Link to="/safety/driver-scheduler" className="text-xs text-slate-700 hover:underline">
            ← Back to Driver Scheduler grid
          </Link>
        </div>
      ) : null}

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
        pageSize={PAGE_SIZE}
        pageSizeOptions={[PAGE_SIZE]}
        hidePager
      />
      ) : null}

      {!query.isError && totalCount > PAGE_SIZE ? (
        <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1 disabled:opacity-50"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1 disabled:opacity-50"
              disabled={(page + 1) * PAGE_SIZE >= totalCount || query.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
