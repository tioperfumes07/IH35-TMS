import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorState } from "../../../components/ListErrorState";

type SessionRow = {
  uuid: string;
  diff_status: string;
  diff_summary: string | null;
  created_at: string;
  unit_uuid: string;
  driver_uuid: string;
  unit_number?: string;
  driver_name?: string;
};

const PAGE_SIZE = 50;

async function fetchSessions(operatingCompanyId: string, page: number) {
  return apiRequest<{ sessions: SessionRow[]; total_count: number }>(
    `/api/safety/photo-comparison/sessions?operating_company_id=${encodeURIComponent(operatingCompanyId)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
  );
}

export function PhotoComparisonPage() {
  // @matrix-built safety:photo_comparison.list:{connectivity,qbo_chrome}
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [companyId]);

  const query = useQuery({
    queryKey: ["photo-comparison-sessions", companyId, page],
    queryFn: () => fetchSessions(companyId, page),
    enabled: Boolean(companyId),
  });

  const sessions = query.data?.sessions ?? [];
  const totalCount = query.data?.total_count ?? 0;

  const columns = useMemo<ParityColumn<SessionRow>[]>(
    () => [
      { key: "created_at", label: "Date", sortable: true, render: (session) => new Date(session.created_at).toLocaleDateString() },
      { key: "unit_number", label: "Unit", sortable: true, render: (session) => <EntityLink kind="unit" id={session.unit_uuid} label={entityLabel(session.unit_number, session.unit_uuid, "Unit")} /> },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (session) => <EntityLink kind="driver" id={session.driver_uuid} label={entityLabel(session.driver_name, session.driver_uuid, "Driver")} />,
      },
      { key: "diff_status", label: "Status", sortable: true },
      { key: "diff_summary", label: "Summary", render: (session) => session.diff_summary ?? "—" },
      {
        key: "actions",
        label: "Actions",
        render: (session) => (
          <EntityLink
            kind="photo_comparison_session"
            id={session.uuid}
            label="View"
            className="text-slate-700 underline"
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3 p-4">
      <PageHeader backHref="/safety" breadcrumb={["Safety", "Photo Comparison"]} title="Photo Comparison" subtitle="AI pre/post-trip damage detection" />

      {!companyId ? <p className="text-sm text-red-600">Select operating company.</p> : null}

      {query.isError ? (
        <ListErrorState
          title="Couldn't load photo comparison sessions"
          status={0}
          message={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<SessionRow>
          columns={columns}
          rows={sessions}
          rowKey={(session) => session.uuid}
          loading={query.isLoading}
          emptyText="No photo comparison sessions found."
          storageKey="safety-photo-comparison-sessions"
          exportFilename="photo-comparison-sessions"
          pageSize={PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
          hidePager
        />
      )}

      {!query.isError && totalCount > PAGE_SIZE ? (
        <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </span>
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
