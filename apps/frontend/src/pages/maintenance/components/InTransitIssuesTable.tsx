import type { InTransitIssue } from "../../../api/maintenance";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Props = {
  issues: InTransitIssue[];
  totalCount: number;
  /** MAINT-S14/S15 — ParityTable emptyText only when settled. */
  loading?: boolean;
  onTriage: (issue: InTransitIssue) => void;
};

// §7 severity styling — single red (severe), single amber (warning), slate (info).
function severityChip(severity: string) {
  const s = severity.toLowerCase();
  if (s === "severe" || s === "major") return "border-[#A32D2D] bg-[#fbeaea] text-[#A32D2D]";
  if (s === "warning" || s === "minor") return "border-[#854F0B] bg-[#fdf3e6] text-[#854F0B]";
  return "border-gray-300 bg-gray-100 text-gray-600";
}

function formatHours(h: number): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  return `${Math.round(h)}h ago`;
}

function formatEta(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

// In-Transit faults are FLAT (one issue per row — no nesting), so this is a plain universal-list
// ParityTable, not the parent+expand shape used by Arriving Soon.
export function InTransitIssuesTable({ issues, totalCount, loading = false, onTriage }: Props) {
  const columns: Array<ParityColumn<InTransitIssue>> = [
    {
      key: "unit_display_id",
      label: "Unit",
      sortable: true,
      render: (issue) => (
        <EntityLinkOrTombstone kind="unit" id={issue.unit_id} name={issue.unit_display_id} noun="Unit" className="font-semibold" />
      ),
    },
    {
      key: "driver_full_name",
      label: "Driver",
      sortable: true,
      render: (issue) => <EntityLinkOrTombstone kind="driver" id={issue.driver_id} name={issue.driver_full_name} noun="Driver" />,
    },
    {
      // Design parity (in-transit-issues.html): Load # after Driver. Backed by dispatch.intransit_issues.load_id.
      key: "load_display_id",
      label: "Load #",
      sortable: true,
      render: (issue) => <EntityLinkOrTombstone kind="load" id={issue.load_id} name={issue.load_display_id} noun="Load" />,
    },
    // Preview's "Fault" column = the issue category. Description kept as a useful extra (additive).
    { key: "issue_category", label: "Fault", sortable: true },
    { key: "issue_description", label: "Description", render: (issue) => issue.issue_description },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (issue) => (
        <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${severityChip(issue.severity)}`}>{issue.severity}</span>
      ),
    },
    { key: "gps_label", label: "Location", render: (issue) => issue.gps_label ?? "—" },
    // Design parity: ETA = the issue stop's scheduled arrival (real scheduled data). Reported kept as extra.
    { key: "eta_at", label: "ETA", sortable: true, render: (issue) => formatEta(issue.eta_at) },
    { key: "hours_since_report", label: "Reported", sortable: true, render: (issue) => formatHours(issue.hours_since_report) },
  ];

  const rowActions = (issue: InTransitIssue) => (
    <button
      type="button"
      className="rounded-sm border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      onClick={() => onTriage(issue)}
    >
      Triage
    </button>
  );

  return (
    <div className="space-y-2">
    {totalCount > issues.length ? (
      <p className="text-xs text-slate-500" data-testid="in-transit-issues-range">
        Showing {issues.length} of {totalCount} in-transit issues.
      </p>
    ) : null}
    <ParityTable<InTransitIssue>
      columns={columns}
      rows={issues}
      rowKey={(issue) => issue.id}
      loading={loading}
      emptyText="No in-transit issues in queue."
      storageKey="maint-in-transit-issues"
      exportFilename="in-transit-issues"
      rowActions={rowActions}
    />
    </div>
  );
}
