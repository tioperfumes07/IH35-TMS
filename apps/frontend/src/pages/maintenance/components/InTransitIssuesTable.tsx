import { Link } from "react-router-dom";
import type { InTransitIssue } from "../../../api/maintenance";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type Props = {
  issues: InTransitIssue[];
  onTriage: (issue: InTransitIssue) => void;
};

const LINK = "text-slate-700 hover:underline";

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
export function InTransitIssuesTable({ issues, onTriage }: Props) {
  const columns: Array<ParityColumn<InTransitIssue>> = [
    {
      key: "unit_display_id",
      label: "Unit",
      sortable: true,
      render: (issue) => (
        <Link to={`/fleet/units/${issue.unit_id}`} className={`${LINK} font-semibold`}>
          {issue.unit_display_id}
        </Link>
      ),
    },
    {
      key: "driver_full_name",
      label: "Driver",
      sortable: true,
      render: (issue) =>
        issue.driver_id ? (
          <Link to={`/drivers/${issue.driver_id}`} className={LINK}>
            {issue.driver_full_name ?? issue.driver_id.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-gray-400">Unassigned</span>
        ),
    },
    {
      // Design parity (in-transit-issues.html): Load # after Driver. Backed by dispatch.intransit_issues.load_id.
      key: "load_display_id",
      label: "Load #",
      sortable: true,
      render: (issue) =>
        issue.load_id ? (
          <Link to={`/dispatch/loads/${issue.load_id}`} className={LINK}>
            {issue.load_display_id ?? issue.load_id.slice(0, 8)}
          </Link>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    // Preview's "Fault" column = the issue category. Description kept as a useful extra (additive).
    { key: "issue_category", label: "Fault", sortable: true },
    { key: "issue_description", label: "Description", render: (issue) => issue.issue_description },
    {
      key: "severity",
      label: "Severity",
      sortable: true,
      render: (issue) => (
        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${severityChip(issue.severity)}`}>{issue.severity}</span>
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
      className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      onClick={() => onTriage(issue)}
    >
      Triage
    </button>
  );

  return (
    <ParityTable<InTransitIssue>
      columns={columns}
      rows={issues}
      rowKey={(issue) => issue.id}
      emptyText="No in-transit issues in queue."
      storageKey="maint-in-transit-issues"
      exportFilename="in-transit-issues"
      rowActions={rowActions}
    />
  );
}
