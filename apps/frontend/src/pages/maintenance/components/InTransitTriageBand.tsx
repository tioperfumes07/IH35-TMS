import type { InTransitIssue } from "../../../api/maintenance";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { V3SideCard } from "../../../components/v3/V3SideCard";

type Props = {
  issues: InTransitIssue[];
  totalCount: number;
  onTriage: (issue: InTransitIssue) => void;
  /** Full in-transit queue (Driver reports › In transit), with ?ret back to the board. */
  viewAllHref?: string;
};

export function InTransitTriageBand({ issues, totalCount, onTriage, viewAllHref }: Props) {
  // ROUND 9.0 board 22 — the design's side card: IN-TRANSIT ISSUES · count · "T177 other · 20h · Triage →" lines.
  return (
    <V3SideCard title="In-transit issues" count={totalCount} href={viewAllHref} testId="maint-side-in-transit">
      {totalCount > issues.length ? (
        <div data-testid="in-transit-triage-band-range">Showing {issues.length} of {totalCount} issues.</div>
      ) : null}
      {issues.slice(0, 3).map((issue) => (
        <div key={issue.id} className="flex flex-wrap items-baseline gap-1">
          <EntityLink kind="unit" id={issue.unit_id} label={entityLabel(issue.unit_display_id, issue.unit_id, "Unit")} />
          <span>{issue.issue_category} · {Math.floor(issue.hours_since_report)}h ·</span>
          <button type="button" onClick={() => onTriage(issue)} className="text-[#1D4ED8]">Triage →</button>
        </div>
      ))}
      {issues.length === 0 ? "No in-transit issues in queue." : null}
    </V3SideCard>
  );
}
