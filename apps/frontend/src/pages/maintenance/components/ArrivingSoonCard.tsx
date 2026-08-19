import type { ArrivingSoonCard as ArrivingSoonCardType } from "../../../api/maintenance";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

type Props = {
  card: ArrivingSoonCardType;
  canConvert: boolean;
  onConvert: (card: ArrivingSoonCardType) => void;
};

function severityClass(card: ArrivingSoonCardType) {
  if (card.severe_count > 0) return "border-l-4 border-l-red-500";
  if (card.already_arrived) return "border-l-4 border-l-slate-500";
  return "border-l-4 border-l-gray-300";
}

export function ArrivingSoonCard({ card, canConvert, onConvert }: Props) {
  return (
    <article className={`rounded-sm border border-gray-200 bg-white p-3 text-xs ${severityClass(card)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">
          <EntityLinkOrTombstone kind="unit" id={card.unit_id} name={card.unit_number} noun="Unit" /> ·{" "}
          <EntityLinkOrTombstone kind="driver" id={card.driver_id} name={card.driver_name} noun="Driver" /> ·{" "}
          <EntityLinkOrTombstone kind="load" id={card.load_id} name={card.load_display_id} noun="Load" />
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${card.severe_count > 0 ? "bg-red-100 text-red-700" : card.warning_count > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
          {card.severe_count > 0 ? "SEVERE" : card.warning_count > 0 ? "WARNING" : "INFO"}
        </span>
      </div>

      <div className="mt-1 text-gray-700">
        {card.final_dest_name ? `→ ${card.final_dest_name}, ${card.final_dest_city ?? ""} ${card.final_dest_state ?? ""}` : "→ destination unavailable"}
      </div>
      <div className="mt-1 text-[11px] text-gray-600">
        {card.final_dest_is_yard
          ? `ETA: ${card.predicted_yard_arrival_at ? new Date(card.predicted_yard_arrival_at).toLocaleString() : "unscheduled"}`
          : "DEADHEAD-BACK PENDING · ETA unscheduled — confirm with dispatch"}
        {card.already_arrived ? <span className="ml-2 rounded-sm bg-slate-100 px-1 py-0.5 text-slate-700">AT YARD</span> : null}
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[11px] font-semibold text-gray-700">Open issues ({card.total_open_issues}):</div>
        <ul className="space-y-1">
          {card.issues.slice(0, 3).map((issue) => (
            <li key={issue.issue_id} className="rounded-sm border border-gray-100 bg-gray-50 px-2 py-1">
              {issue.description || issue.issue_type} — {issue.severity}
            </li>
          ))}
        </ul>
        {card.total_open_issues > card.issues.slice(0, 3).length ? (
          <p className="mt-1 text-[11px] text-slate-500" data-testid="arriving-soon-issues-range">
            Showing {card.issues.slice(0, 3).length} of {card.total_open_issues} open issues.
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {canConvert ? (
          <button type="button" className="rounded-sm border border-slate-300 px-2 py-1 text-slate-700" onClick={() => onConvert(card)}>
            Convert to WO
          </button>
        ) : (
          <span className="rounded-sm border border-gray-200 px-2 py-1 text-gray-500">Read-only</span>
        )}
        <EntityLinkOrTombstone kind="load" id={card.load_id} name="View Load" noun="Load" className="rounded-sm border border-gray-300 px-2 py-1 text-gray-700" />
        <EntityLinkOrTombstone kind="driver" id={card.driver_id} name="View Driver" noun="Driver" className="rounded-sm border border-gray-300 px-2 py-1 text-gray-700" />
      </div>
    </article>
  );
}
