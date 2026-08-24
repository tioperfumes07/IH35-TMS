import { entityLabel } from "../../../lib/entity-label";
import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Button } from "../../../components/Button";
import { fetchAuditReport, type AuditReportParams, type AuditReportRow } from "../../../api/auditReports";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";

const PAGE_SIZE = 100;

// ACCT-F5303: events.event_log.subject_type is a free-text column (see valid_subject_type CHECK,
// db/migrations/202606111050_w1a_event_log_spine.sql widened by 202612540000). Only map the subset
// that is BOTH allowlisted there AND a real EntityLink kind — everything else (e.g. 'task', 'status',
// 'assignment') stays plain text rather than guessing a drill-through route that may not exist.
const SUBJECT_TYPE_TO_ENTITY_KIND: Partial<Record<string, EntityKind>> = {
  load: "load",
  invoice: "invoice",
  bill: "bill",
  journal_entry: "journal_entry",
  driver: "driver",
  unit: "unit",
  customer: "customer",
  vendor: "vendor",
  work_order: "work_order",
};

function subjectTypeToEntityLinkKind(subjectType: string | null | undefined): EntityKind | null {
  if (!subjectType) return null;
  return SUBJECT_TYPE_TO_ENTITY_KIND[subjectType] ?? null;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

type AuditReportTableRow = AuditReportRow & { row_key: string };

const AUDIT_REPORT_COLUMNS: Array<ParityColumn<AuditReportTableRow>> = [
  {
    key: "occurred_at",
    label: "Date/Time",
    sortable: true,
    sortValue: (row) => new Date(row.occurred_at).getTime(),
    render: (row) => <span className="whitespace-nowrap text-gray-500">{formatDate(row.occurred_at)}</span>,
  },
  {
    key: "event_type",
    label: "Event Type",
    sortable: true,
    render: (row) => <span className="font-mono text-gray-700">{row.event_type}</span>,
  },
  {
    key: "subject_type",
    label: "Subject",
    sortable: true,
    sortValue: (row) => `${row.subject_kind ?? row.subject_type ?? ""}:${row.subject_label ?? row.subject_id ?? ""}`,
    render: (row) => {
      const subjectKind = row.subject_kind ?? row.subject_type;
      const kind = subjectTypeToEntityLinkKind(subjectKind);
      const label = entityLabel(row.subject_label, row.subject_id, "Subject");
      return (
        <span className="text-gray-500">
          {subjectKind ?? "—"}
          {row.subject_id ? (
            kind ? (
              <>
                {" · "}
                <EntityLink kind={kind} id={row.subject_id} label={label} />
              </>
            ) : (
              ` · ${label}`
            )
          ) : (
            ""
          )}
        </span>
      );
    },
  },
  {
    key: "actor_email",
    label: "Actor",
    sortable: true,
    sortValue: (row) => entityLabel(row.actor_email, row.actor_user_id, "User"),
    render: (row) => <EntityLink kind="user" id={row.actor_user_id} label={entityLabel(row.actor_email, row.actor_user_id, "User") ?? "—"} className="text-gray-500" />,
  },
  {
    key: "source",
    label: "Source",
    sortable: true,
    render: (row) => <span className="text-gray-400">{row.source ?? "—"}</span>,
  },
];

function rowsToCsv(rows: AuditReportRow[], title: string): string {
  const headers = ["occurred_at", "event_type", "subject_type", "subject_kind", "subject_id", "subject_label", "actor_email", "source"];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      JSON.stringify(r.occurred_at ?? ""),
      JSON.stringify(r.event_type ?? ""),
      JSON.stringify(r.subject_type ?? ""),
      JSON.stringify(r.subject_kind ?? ""),
      JSON.stringify(r.subject_id ?? ""),
      JSON.stringify(r.subject_label ?? ""),
      JSON.stringify(r.actor_email ?? ""),
      JSON.stringify(r.source ?? ""),
    ].join(","));
  }
  return `# ${title}\n` + lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export interface AuditReportPageProps {
  title: string;
  subtitle: string;
  endpoint: string;
  extraParams?: Partial<AuditReportParams>;
  showModuleFilter?: boolean;
  showDriverFilter?: boolean;
  backHref?: string;
  breadcrumb?: string[];
}

export function AuditReportPage({ title, subtitle, endpoint, extraParams, showModuleFilter, showDriverFilter, backHref, breadcrumb }: AuditReportPageProps) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const params: AuditReportParams = {
    operating_company_id: companyId,
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to   ? { to:   new Date(to).toISOString()   } : {}),
    ...(showModuleFilter && moduleFilter ? { module: moduleFilter } : {}),
    ...(showDriverFilter && driverFilter ? { driver_id: driverFilter } : {}),
    ...extraParams,
    limit: PAGE_SIZE,
    offset,
  };

  const query = useQuery({
    queryKey: ["audit-report", endpoint, params],
    queryFn: () => fetchAuditReport(endpoint, params),
    enabled: Boolean(companyId),
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const tableRows = useMemo<AuditReportTableRow[]>(
    () => rows.map((row, index) => ({ ...row, row_key: `${row.occurred_at}:${row.event_type}:${row.subject_id ?? ""}:${index}` })),
    [rows],
  );
  const totalCount = query.data?.total_count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  function handleCsvExport() {
    if (rows.length === 0) return;
    downloadCsv(rowsToCsv(rows, title), `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.csv`);
  }

  return (
    <div className="space-y-4">
      <div>
        <PageHeader title={title} subtitle={subtitle} backHref={backHref} breadcrumb={breadcrumb} />
      </div>

      <div className="text-xs text-gray-400">{totalCount} record{totalCount !== 1 ? "s" : ""}</div>

      {!query.isError && (
        <ParityTable
          rows={tableRows}
          columns={AUDIT_REPORT_COLUMNS}
          rowKey={(row) => row.row_key}
          loading={query.isLoading}
          storageKey="audit-report-page"
          emptyText="No records for the selected filters."
          tableTestId="audit-report-table"
          // REPORTS-F6363: `rows` here is already ONE server-paged batch (offset/limit below owns
          // the real page). Without pageSize+hidePager, ParityTable's own uncontrolled pager
          // silently re-slices that batch into its own 15-per-page pages ("Page 1 of 7") on top
          // of the real "Prev/Next Page 1 of 3" pager beneath it — two disconnected, conflicting
          // pagers on one table, the top one going stale (still "Page 1 of 7") the moment the
          // bottom pager fetches a new batch. Per ParityTable's own documented "caller pre-pages"
          // combo: pageSize = server page size + hidePager — no double slicing.
          pageSize={PAGE_SIZE}
          hidePager
          toolbar={
            <Button size="sm" variant="secondary" onClick={handleCsvExport} disabled={rows.length === 0}>
              Export CSV
            </Button>
          }
          filterBar={
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">From</label>
                <DatePicker value={from} onChange={(next) => { setFrom(next); setOffset(0); }}
                  className="" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">To</label>
                <DatePicker value={to} onChange={(next) => { setTo(next); setOffset(0); }}
                  className="" />
              </div>
              {showModuleFilter && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Module</label>
                  <input type="text" value={moduleFilter} placeholder="e.g. dispatch"
                    onChange={(e) => { setModuleFilter(e.target.value); setOffset(0); }}
                    className="rounded-sm border border-gray-300 px-2 py-1 text-sm" />
                </div>
              )}
              {showDriverFilter && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Driver</label>
                  {/* C1 PICKER LAW: was a raw-UUID box. It sits on an audit REPORT, but a driver is a
                      first-class entity with a canonical roster, so it is NOT an opaque forensic id
                      and does not qualify for the admin-audit exemption. FILTER → allowCreate={false}. */}
                  <EntityPicker
                    kind="driver"
                    operatingCompanyId={companyId}
                    value={driverFilter || null}
                    onChange={(next) => { setDriverFilter(next ?? ""); setOffset(0); }}
                    allowCreate={false}
                    placeholder="All drivers"
                  />
                </div>
              )}
            </div>
          }
        />
      )}

      {query.isError && <div className="py-4 text-center text-sm text-red-500">Failed to load report.</div>}

      {!query.isError && (
        <>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Prev</Button>
              <span className="text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
              <Button size="sm" variant="secondary" disabled={currentPage >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
