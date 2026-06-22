import type { InTransitIssue } from "../../../api/maintenance";

type Props = {
  issues: InTransitIssue[];
  onTriage: (issue: InTransitIssue) => void;
};

export function InTransitTriageBand({ issues, onTriage }: Props) {
  return (
    <div className="rounded border border-amber-300 bg-amber-50">
      <div className="border-b border-amber-200 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">In-Transit Issues</div>
      <div className="max-h-40 overflow-y-auto">
        {issues.map((issue) => (
          <button
            key={issue.id}
            type="button"
            onClick={() => onTriage(issue)}
            className="flex w-full items-center justify-between border-b border-amber-100 px-2 py-1 text-left text-xs hover:bg-amber-100"
          >
            <span className="font-semibold">{issue.unit_display_id}</span>
            <span>{issue.issue_category}</span>
            <span>{Math.floor(issue.hours_since_report)}h</span>
            <span className="text-slate-700">Triage →</span>
          </button>
        ))}
        {issues.length === 0 ? <div className="px-2 py-2 text-xs text-amber-700">No in-transit issues in queue.</div> : null}
      </div>
    </div>
  );
}
