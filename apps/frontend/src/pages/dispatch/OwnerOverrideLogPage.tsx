import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listOwnerOverrideLog } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatQueryErrorDetail } from "../../lib/tableError";

// DISPATCH-F6251-OWNER-OVERRIDE-LOG / OWNER-OVERRIDE-LOG — this page is the missing consumer for the critical
// "Owner override — driver qualification (CDL / DOT medical)" notification's action_link
// (/dispatch/owner-override-log). The backend read-only WORM-audit endpoint existed and worked;
// nothing rendered it, so the notification's "Open" button silently fell through the router's
// catch-all to "/" — a critical safety-override transparency control with a dead CTA. See
// dispatch-override-notice.handler.ts and dispatch-refinements.routes.ts for the producer/API.
const overrideClassLabel = (row: { override_class: string | null; event_class: string }) => {
  if (row.override_class === "DOT_QUALIFICATION") return "Driver qualification (CDL / DOT medical)";
  return row.override_class ?? row.event_class;
};

export function OwnerOverrideLogPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const pageSize = 100;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [companyId]);

  const logQ = useQuery({
    queryKey: ["dispatch", "owner-override-log", companyId, offset],
    queryFn: () => listOwnerOverrideLog(companyId, { limit: pageSize, offset }),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const rows = logQ.data?.overrides ?? [];
  const total = logQ.data?.total ?? 0;
  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  type Row = (typeof rows)[number];

  const columns: Array<ParityColumn<Row>> = [
    { key: "created_at", label: "When", sortable: true, render: (row) => new Date(row.created_at).toLocaleString() },
    { key: "override_class", label: "Blocker overridden", render: overrideClassLabel },
    {
      key: "driver_name",
      label: "Driver",
      render: (row) => {
        if (!row.driver_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.driver_name, row.driver_id, "Driver");
        if (isUnresolvedEntityTombstone(row.driver_name, row.driver_id, "Driver")) {
          return <span className="text-slate-600" data-testid="owner-override-log-driver-tombstone">{label}</span>;
        }
        return <EntityLink kind="driver" id={row.driver_id} label={label} data-testid="owner-override-log-driver-link" />;
      },
    },
    {
      key: "overridden_reasons",
      label: "Specific blocker codes",
      render: (row) => (Array.isArray(row.overridden_reasons) && row.overridden_reasons.length > 0 ? row.overridden_reasons.join(", ") : "—"),
    },
    { key: "override_reason", label: "Reason given", render: (row) => row.override_reason ?? "—" },
    { key: "actor_role", label: "Overridden by (role)", render: (row) => row.actor_role ?? "—" },
  ];

  return (
    <div data-testid="dispatch-owner-override-log-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Owner Override Log"
        subtitle="Read-only WORM audit trail of every dispatch blocker overridden by an Owner (DOT / insurer / attorney visibility)"
        actions={
          <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch Home
          </Link>
        }
      />

      {logQ.isError ? (
        <ListErrorState
          title="Couldn't load owner override log"
          {...formatQueryErrorDetail(logQ.error)}
          onRetry={() => void logQ.refetch()}
        />
      ) : (
        <ParityTable<Row>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={logQ.isLoading}
          emptyText="No owner overrides recorded."
          storageKey="dispatch-owner-override-log"
          exportFilename="owner-override-log"
          hidePager
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600" data-testid="owner-override-log-server-pager">
        <span>
          {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + pageSize, total)}`} of {total} overrides · Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={offset === 0 || logQ.isFetching} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
            Previous
          </Button>
          <Button size="sm" variant="secondary" disabled={offset + pageSize >= total || logQ.isFetching} onClick={() => setOffset(offset + pageSize)}>
            Next
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => void logQ.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
