/**
 * SAF-B31 — 425C Audit Trail.
 *
 * ROOT CAUSE this file replaces: the route `/safety/audit-425c` was registered and linked from
 * SAFETY_TABS_CONFIG, but the component was an 11-line static placeholder promising "Filter by 425C
 * section and open source event detail from each audit row" while issuing zero queries.
 *
 * READER: GET /api/v1/audit/events-list (apps/backend/src/audit/audit-events-list.routes.ts:178).
 * It reads audit.audit_events with the columns that table actually has (uuid, created_at,
 * event_class, severity, payload, actor_user_uuid, source), scoped by
 * `payload->>'operating_company_id'`, and supports event_type / from / to / actor / limit / offset
 * server-side plus a real total_count.
 *
 * WHY NOT /api/v1/safety/audit-425c: that route (apps/backend/src/safety/audit-425c.routes.ts:36)
 * selects `id` and `emitted_at` from audit.audit_events. Neither column exists — 0001_audit_init.sql
 * defines `uuid` and `created_at`, and no later migration adds `emitted_at` (grep over
 * db/migrations/ returns zero hits). That endpoint therefore raises undefined_column at runtime.
 * SAF-B31 is frontend-only, so the broken route is left untouched and REPORTED, not patched here.
 *
 * SECTIONS are real, not invented: Form 425C writers stamp `resource_type` into the audit payload —
 * compliance.form_425c_reports / _exhibit_a_entries / _exhibit_b_entries (form-425c.routes.ts:575,
 * :1065, :1103). Exhibit A carries lines 1-9 and Exhibit B lines 10-18 per
 * db/migrations/0053_p3_t11_13_form_425c.sql. The section filter is applied client-side because
 * events-list only filters `payload->>'entity_type'`, which these writers do not set; the shown /
 * total counts are surfaced so a truncated page is never mistaken for a complete trail.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { listAuditEvents, type AuditEventListItem } from "../../../api/audit";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useStagedListFilters } from "../../../components/table";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { PageHeader } from "../../../components/forms/shared/PageHeader";
import { Combobox } from "../../../components/Combobox";
import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";

/** ILIKE fragment matched against audit.audit_events.event_class by the reader. */
const FORM_425C_EVENT_FILTER = "form_425c";
const PAGE_LIMIT = 500;

type Form425cSectionId = "all" | "report" | "exhibit_a" | "exhibit_b";

const SECTIONS: Array<{ id: Form425cSectionId; label: string; resourceType: string | null }> = [
  { id: "all", label: "All sections", resourceType: null },
  { id: "report", label: "Report - Parts 1-2 / lines 19-42", resourceType: "compliance.form_425c_reports" },
  { id: "exhibit_a", label: "Exhibit A - lines 1-9", resourceType: "compliance.form_425c_exhibit_a_entries" },
  { id: "exhibit_b", label: "Exhibit B - lines 10-18", resourceType: "compliance.form_425c_exhibit_b_entries" },
];

type Form425cPayload = {
  operating_company_id?: string;
  resource_type?: string;
  resource_id?: string;
  report_id?: string;
  line_number?: number;
  attachment_line?: number;
  reporting_month?: string;
  updated_fields?: string[];
  carry_forward_source_report_id?: string | null;
};

type Form425cAuditRow = AuditEventListItem & { payload?: Form425cPayload };

function payloadOf(row: AuditEventListItem): Form425cPayload {
  const raw = (row as Form425cAuditRow).payload;
  return raw && typeof raw === "object" ? raw : {};
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function sectionLabelFor(resourceType: string | undefined): string {
  const match = SECTIONS.find((section) => section.resourceType && section.resourceType === resourceType);
  return match ? match.label : resourceType || "Unclassified";
}

/**
 * Drill-through target for a row's source record. The Form 425C module routes that exist today are
 * `/425c` (tabbed home, including History) and `/425c/exhibits`. There is no per-report detail route,
 * so no fabricated deep link is emitted — the row carries its resource id alongside the link.
 */
function sourceLinkFor(payload: Form425cPayload): { to: string; label: string } | null {
  switch (payload.resource_type) {
    case "compliance.form_425c_reports":
      return { to: "/425c?tab=history", label: "Open 425C report history" };
    case "compliance.form_425c_exhibit_a_entries":
    case "compliance.form_425c_exhibit_b_entries":
      return { to: "/425c/exhibits", label: "Open 425C exhibits" };
    default:
      return null;
  }
}

function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : 0;
}

function EventDetail({ row }: { row: AuditEventListItem }) {
  const payload = payloadOf(row);
  const link = sourceLinkFor(payload);
  const facts: Array<[string, string]> = [
    ["Section", sectionLabelFor(payload.resource_type)],
    ["Source record", payload.resource_id ?? "-"],
    ["Report", payload.report_id ?? (payload.resource_type === "compliance.form_425c_reports" ? payload.resource_id ?? "-" : "-")],
    ["Reporting month", payload.reporting_month ?? "-"],
    ["Exhibit line", payload.line_number == null ? "-" : String(payload.line_number)],
    ["Attachment line", payload.attachment_line == null ? "-" : String(payload.attachment_line)],
    ["Fields changed", payload.updated_fields?.length ? payload.updated_fields.join(", ") : "-"],
    ["Actor", entityLabel(row.actor_email, row.actor_user_id, "User") ?? "-"],
    ["Emitted by", row.source ?? "-"],
  ];
  return (
    <div className="space-y-2 text-xs">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-32 shrink-0 font-semibold text-slate-700">{label}</dt>
            <dd className="wrap-break-word text-slate-600">{value}</dd>
          </div>
        ))}
      </dl>
      {link ? (
        <Link to={link.to} className="inline-block font-semibold text-slate-700 underline">
          {link.label}
        </Link>
      ) : (
        <span className="text-slate-500">No source-record route for this resource type.</span>
      )}
    </div>
  );
}

export default function Audit425cPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const enabled = Boolean(companyId);

  // LV-SAFETY-AUDIT-425C-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  const EMPTY_FILTERS = {
    section: "all" as Form425cSectionId,
    action: "",
    actor: "",
    from: "",
    to: "",
  };
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: setApplied,
  });
  const draft = staged.draft;

  const fromIso = applied.from ? new Date(`${applied.from}T00:00:00`).toISOString() : undefined;
  const toIso = applied.to ? new Date(`${applied.to}T23:59:59`).toISOString() : undefined;

  const auditQuery = useQuery({
    queryKey: ["saf-b31", "audit-425c", companyId, applied.actor, fromIso, toIso],
    queryFn: () =>
      listAuditEvents({
        operatingCompanyId: companyId,
        eventType: [FORM_425C_EVENT_FILTER],
        actor: applied.actor.trim() || undefined,
        from: fromIso,
        to: toIso,
        limit: PAGE_LIMIT,
      }),
    enabled,
  });

  const allEvents = useMemo(() => auditQuery.data?.events ?? [], [auditQuery.data]);

  const actionOptions = useMemo(
    () => Array.from(new Set(allEvents.map((row) => row.event_type))).sort(),
    [allEvents]
  );

  const rows = useMemo(() => {
    const wantedResourceType = SECTIONS.find((s) => s.id === applied.section)?.resourceType ?? null;
    return allEvents.filter((row) => {
      if (applied.action && row.event_type !== applied.action) return false;
      if (!wantedResourceType) return true;
      return payloadOf(row).resource_type === wantedResourceType;
    });
  }, [allEvents, applied.section, applied.action]);

  const totalCount = auditQuery.data?.total_count ?? 0;

  const columns = useMemo<Array<ParityColumn<AuditEventListItem>>>(
    () => [
      {
        key: "created_at",
        label: "When",
        sortable: true,
        sortValue: (row) => new Date(row.created_at).getTime(),
        render: (row) => <span className="whitespace-nowrap">{formatWhen(row.created_at)}</span>,
      },
      {
        key: "section",
        label: "425C Section",
        sortable: true,
        sortValue: (row) => sectionLabelFor(payloadOf(row).resource_type),
        render: (row) => <span className="text-slate-700">{sectionLabelFor(payloadOf(row).resource_type)}</span>,
      },
      {
        key: "event_type",
        label: "Action",
        sortable: true,
        render: (row) => (
          <span className="inline-block rounded-sm bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
            {row.event_type}
          </span>
        ),
      },
      {
        key: "summary",
        label: "Summary",
        sortable: true,
        render: (row) => <span className="text-slate-600">{row.summary || "-"}</span>,
      },
      {
        key: "line",
        label: "Line",
        sortable: true,
        sortValue: (row) => payloadOf(row).line_number ?? payloadOf(row).attachment_line ?? 0,
        render: (row) => {
          const payload = payloadOf(row);
          const line = payload.line_number ?? payload.attachment_line;
          return <span className="text-slate-600">{line == null ? "-" : String(line)}</span>;
        },
      },
      {
        key: "actor_email",
        label: "Actor",
        sortable: true,
        render: (row) => (
          <span className="text-slate-600">
            <EntityLink kind="user" id={row.actor_user_id} label={entityLabel(row.actor_email, row.actor_user_id, "User")} />
          </span>
        ),
      },
      {
        key: "source_record",
        label: "Source Record",
        render: (row) => {
          const payload = payloadOf(row);
          const link = sourceLinkFor(payload);
          if (!link) return <span className="text-slate-500">-</span>;
          return (
            <Link to={link.to} className="font-semibold text-slate-700 underline">
              {link.label}
            </Link>
          );
        },
      },
    ],
    []
  );

  return (
    <main className="space-y-3" data-testid="audit-425c-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="425C Audit Trail"
        subtitle="Append-only Form 425C filing history for the selected entity. Filter by section, action, actor, or date, and open the source record from any row."
        breadcrumb={[{ label: "Safety" }, { label: "425C Audit Trail" }]}
        backHref="/safety"
      />

      {!enabled ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-slate-700">
          Select an operating company to load its 425C audit trail.
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3" data-testid="audit-425c-filters">
        <div className="text-xs text-slate-600">
          <label htmlFor="audit-425c-section-filter">425C section</label>
          <Combobox
            id="audit-425c-section-filter"
            dataTestId="audit-425c-section-filter"
            className="mt-1 min-w-64"
            value={draft.section}
            options={SECTIONS.map((option) => ({ value: option.id, label: option.label }))}
            onChange={(next) => staged.setDraft((d) => ({ ...d, section: next as Form425cSectionId }))}
          />
        </div>
        <div className="text-xs text-slate-600">
          <label htmlFor="audit-425c-action-filter">Action</label>
          <Combobox
            id="audit-425c-action-filter"
            dataTestId="audit-425c-action-filter"
            className="mt-1 min-w-48"
            value={draft.action}
            options={[
              { value: "", label: "All actions" },
              ...actionOptions.map((value) => ({ value, label: humanizeEnumLabel(value) })),
            ]}
            onChange={(next) => staged.setDraft((d) => ({ ...d, action: next ?? "" }))}
          />
        </div>
        <label className="text-xs text-slate-600">
          Actor
          <input
            className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
            value={draft.actor}
            onChange={(event) => staged.setDraft((d) => ({ ...d, actor: event.target.value }))}
            placeholder="email or user id"
            data-testid="audit-425c-actor-filter"
          />
        </label>
        <div className="text-xs text-slate-600">
          <label htmlFor="audit-425c-from-date">From</label>
          <DatePicker
            id="audit-425c-from-date"
            className="mt-1 block"
            value={draft.from}
            onChange={(next) => staged.setDraft((d) => ({ ...d, from: next }))}
            data-testid="audit-425c-from-date"
          />
        </div>
        <div className="text-xs text-slate-600">
          <label htmlFor="audit-425c-to-date">To</label>
          <DatePicker
            id="audit-425c-to-date"
            className="mt-1 block"
            value={draft.to}
            onChange={(next) => staged.setDraft((d) => ({ ...d, to: next }))}
            data-testid="audit-425c-to-date"
          />
        </div>
        <Button type="button" size="sm" data-testid="audit-425c-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button type="button" size="sm" variant="secondary" data-testid="audit-425c-filter-cancel" onClick={staged.cancel} disabled={!staged.dirty}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="audit-425c-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {enabled && !auditQuery.isLoading && !auditQuery.isError ? (
        <div className="rounded-sm border border-gray-200 bg-slate-50 p-2 text-[11px] text-slate-600">
          Showing {rows.length} of {allEvents.length} loaded 425C events ({totalCount} match this entity and date range
          server-side; the reader returns at most {PAGE_LIMIT} per request). Narrow the date range if the loaded count is
          capped.
        </div>
      ) : null}

      {auditQuery.isError ? (
        <ListErrorState
          title="Couldn't load the 425C audit trail"
          status={errorStatus(auditQuery.error)}
          message={(auditQuery.error as Error)?.message}
          onRetry={() => void auditQuery.refetch()}
        />
      ) : (
        <ParityTable<AuditEventListItem>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={auditQuery.isLoading}
          emptyText="No 425C audit events recorded for this entity."
          storageKey="saf-b31-audit-425c"
          exportFilename="form-425c-audit-trail"
          tableTestId="audit-425c-table"
          rowTestId={(row) => `audit-425c-row-${row.id}`}
          renderExpanded={(row) => <EventDetail row={row} />}
        />
      )}
    </main>
  );
}
