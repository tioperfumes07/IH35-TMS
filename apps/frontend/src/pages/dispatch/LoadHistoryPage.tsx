/**
 * D-H1 — Load History page (/dispatch/loads/:id/history).
 * Read-only timeline: status/edits/assignments/stop stamps/linked docs with EntityLink.
 */
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel } from "../../lib/entity-label";
import {
  getDispatchLoadHistory,
  getLoad,
  type LoadHistoryRow,
  type LoadHistoryLinkedDocument,
  type LoadHistoryLink,
} from "../../api/loads";

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "—";
  return d.toLocaleString();
}

function kindLabel(kind: LoadHistoryRow["kind"]): string {
  switch (kind) {
    case "status_transition":
      return "Status";
    case "field_edit":
      return "Edit";
    case "assignment":
      return "Assignment";
    case "stop_stamp":
      return "Stop stamp";
    case "lock_override":
      return "Owner override";
    case "linked_document":
      return "Document";
    case "gap":
      return "Not recorded";
    default:
      return "Audit";
  }
}

const ENTITY_KINDS = new Set<string>([
  "load",
  "driver",
  "unit",
  "trailer",
  "customer",
  "invoice",
  "factoring_advance",
  "settlement",
  "expense",
  "work_order",
  "user",
]);

function HistoryLink({ link }: { link: LoadHistoryLink }) {
  if (!ENTITY_KINDS.has(link.kind)) {
    return (
      <span className="text-xs text-slate-500" title={link.id}>
        {link.label ?? link.kind}
      </span>
    );
  }
  return <EntityLink kind={link.kind as EntityKind} id={link.id} label={link.label ?? undefined} />;
}

export default function LoadHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const loadQuery = useQuery({
    queryKey: ["load-history-label", companyId, id],
    queryFn: () => getLoad(id as string, companyId),
    enabled: Boolean(id && companyId),
  });

  const historyQuery = useQuery({
    queryKey: ["dispatch-load-history", companyId, id],
    queryFn: () => getDispatchLoadHistory(id as string, companyId),
    enabled: Boolean(id && companyId),
  });

  const loadNumber = loadQuery.data?.load_number ?? historyQuery.data?.load_number ?? null;

  const timelineColumns: ParityColumn<LoadHistoryRow>[] = [
    {
      key: "occurred_at",
      label: "When",
      render: (row) => <span className="whitespace-nowrap text-xs">{formatWhen(row.occurred_at)}</span>,
    },
    {
      key: "kind",
      label: "Type",
      render: (row) => (
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{kindLabel(row.kind)}</span>
      ),
    },
    {
      key: "summary",
      label: "What happened",
      allowWrap: true,
      render: (row) => (
        <div className="text-xs text-slate-800">
          <div>{row.summary}</div>
          {row.field ? (
            <div className="mt-0.5 text-xs text-slate-500">
              {row.field.replace(/_/g, " ")}
              {row.before_value != null || row.after_value != null
                ? `: ${row.before_value ?? "—"} → ${row.after_value ?? "—"}`
                : ""}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "actor_user_id",
      label: "Who",
      render: (row) =>
        row.actor_user_id ? (
          <EntityLink kind="user" id={row.actor_user_id} label={row.actor_label ?? undefined} />
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "source",
      label: "Source",
      render: (row) => <span className="text-xs text-slate-600">{row.source ?? "—"}</span>,
    },
    {
      key: "links",
      label: "Opens",
      allowWrap: true,
      render: (row) => (
        <div className="flex flex-wrap justify-center gap-1">
          {row.links.slice(0, 5).map((l) => (
            <HistoryLink key={`${l.kind}:${l.id}`} link={l} />
          ))}
          {row.links.length === 0 ? <span className="text-xs text-slate-400">—</span> : null}
        </div>
      ),
    },
  ];

  const docColumns: ParityColumn<LoadHistoryLinkedDocument>[] = [
    {
      key: "kind",
      label: "Document",
      render: (row) => <span className="text-xs uppercase text-slate-600">{row.kind.replace(/_/g, " ")}</span>,
    },
    {
      key: "display_id",
      label: "Number",
      render: (row) => {
        const kindMap: Record<LoadHistoryLinkedDocument["kind"], EntityKind> = {
          invoice: "invoice",
          factoring_advance: "factoring_advance",
          settlement_line: "settlement",
          expense: "expense",
          work_order: "work_order",
        };
        return <EntityLink kind={kindMap[row.kind]} id={row.id} label={row.display_id ?? row.id.slice(0, 8)} />;
      },
    },
    {
      key: "status",
      label: "Status",
      render: (row) => <span className="text-xs">{row.status ?? "—"}</span>,
    },
    {
      key: "occurred_at",
      label: "When",
      render: (row) => <span className="text-xs">{formatWhen(row.occurred_at)}</span>,
    },
  ];

  if (!id) {
    return (
      <div className="p-4">
        <p className="text-xs text-slate-600">Missing load id.</p>
        <Link to="/dispatch?view=loads" className="text-xs text-slate-700 underline">
          Open Dispatch loads
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="load-history-page">
      <PageHeader
        title={`Load history · ${entityLabel(loadNumber, id, "Load")}`}
        breadcrumb={["Dispatch", "Loads", entityLabel(loadNumber, id, "Load"), "History"]}
        actions={
          <div className="flex gap-2">
            <Link
              to={`/dispatch/loads/${encodeURIComponent(id)}`}
              className="inline-flex h-7 items-center rounded-sm border border-slate-300 bg-white px-2 text-xs font-medium text-slate-800"
              data-testid="load-history-open-load"
            >
              Open load
            </Link>
          </div>
        }
      />

      {historyQuery.isError ? (
        <ListErrorBanner
          message="Could not load history for this load."
          onRetry={() => void historyQuery.refetch()}
        />
      ) : null}

      <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid="load-history-linked-docs">
        <h2 className="mb-2 text-section-header font-bold uppercase tracking-wide text-slate-600">Linked documents</h2>
        <ParityTable appearance="board"
          columns={docColumns}
          rows={historyQuery.data?.linked_documents ?? []}
          rowKey={(r) => `${r.kind}:${r.id}`}
          emptyText={
            historyQuery.isLoading ? "Loading…" : "No linked invoices, advances, settlements, expenses, or work orders."
          }
        />
      </section>

      <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid="load-history-timeline">
        <h2 className="mb-2 text-section-header font-bold uppercase tracking-wide text-slate-600">Timeline</h2>
        <ParityTable appearance="board"
          columns={timelineColumns}
          rows={historyQuery.data?.rows ?? []}
          rowKey={(r) => r.id}
          emptyText={historyQuery.isLoading ? "Loading…" : "No history events recorded for this load."}
        />
      </section>
    </div>
  );
}
