import { useMemo } from "react";
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

async function fetchSessions(operatingCompanyId: string) {
  return apiRequest<{ sessions: SessionRow[] }>(
    `/api/safety/photo-comparison/sessions?operating_company_id=${operatingCompanyId}`
  );
}

export function PhotoComparisonPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["photo-comparison-sessions", companyId],
    queryFn: () => fetchSessions(companyId),
    enabled: Boolean(companyId),
  });

  const sessions = query.data?.sessions ?? [];

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
        />
      )}
    </div>
  );
}
