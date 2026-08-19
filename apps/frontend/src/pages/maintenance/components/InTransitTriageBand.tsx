import type { InTransitIssue } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

type Props = {
  issues: InTransitIssue[];
  totalCount: number;
  onTriage: (issue: InTransitIssue) => void;
};

export function InTransitTriageBand({ issues, totalCount, onTriage }: Props) {
  return (
    <div className="rounded-sm border border-slate-300 bg-slate-50">
      <div className="border-b border-slate-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-800">In-Transit Issues</div>
      <div className="max-h-40 overflow-y-auto">
        {totalCount > issues.length ? (
          <div className="border-b border-slate-100 px-2 py-1 text-xs text-slate-600" data-testid="in-transit-triage-band-range">
            Showing {issues.length} of {totalCount} issues.
          </div>
        ) : null}
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => onTriage(issue)}
            className="flex w-full items-center justify-between border-b border-slate-100 px-2 py-1 text-left text-xs hover:bg-slate-100"
          >
            <EntityLink kind="unit" id={issue.unit_id} label={entityLabel(issue.unit_display_id, issue.unit_id, "Unit")} className="font-semibold text-slate-700 hover:underline" />
            <span>{issue.issue_category}</span>
            <span>{Math.floor(issue.hours_since_report)}h</span>
            <span className="text-slate-700">Triage →</span>
          </button>
        ))}
        {issues.length === 0 ? <div className="px-2 py-2 text-xs text-slate-700">No in-transit issues in queue.</div> : null}
      </div>
    </div>
  );
}
