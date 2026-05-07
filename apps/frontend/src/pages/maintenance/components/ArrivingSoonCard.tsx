import type { ArrivingSoonCard as ArrivingSoonCardType } from "../../../api/maintenance";

type Props = {
  card: ArrivingSoonCardType;
  canConvert: boolean;
  onConvert: (card: ArrivingSoonCardType) => void;
};

function severityClass(card: ArrivingSoonCardType) {
  if (card.severe_count > 0) return "border-l-4 border-l-red-500";
  if (card.already_arrived) return "border-l-4 border-l-green-500";
  return "border-l-4 border-l-gray-300";
}

export function ArrivingSoonCard({ card, canConvert, onConvert }: Props) {
  return (
    <article className={`rounded border border-gray-200 bg-white p-3 text-xs ${severityClass(card)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold">
          {card.unit_number} · {card.driver_name ?? "Unassigned"} · {card.load_display_id}
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
        {card.already_arrived ? <span className="ml-2 rounded bg-green-100 px-1 py-0.5 text-green-700">AT YARD</span> : null}
      </div>

      <div className="mt-2">
        <div className="mb-1 text-[11px] font-semibold text-gray-700">Open issues ({card.total_open_issues}):</div>
        <ul className="space-y-1">
          {card.issues.slice(0, 3).map((issue) => (
            <li key={issue.issue_id} className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              {issue.description || issue.issue_type} — {issue.severity}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        {canConvert ? (
          <button type="button" className="rounded border border-blue-300 px-2 py-1 text-blue-700" onClick={() => onConvert(card)}>
            Convert to WO
          </button>
        ) : (
          <span className="rounded border border-gray-200 px-2 py-1 text-gray-500">Read-only</span>
        )}
        <a className="rounded border border-gray-300 px-2 py-1 text-gray-700" href={`/dispatch`}>
          View Load
        </a>
        <button type="button" className="rounded border border-gray-300 px-2 py-1 text-gray-700">
          Call Driver
        </button>
      </div>
    </article>
  );
}
