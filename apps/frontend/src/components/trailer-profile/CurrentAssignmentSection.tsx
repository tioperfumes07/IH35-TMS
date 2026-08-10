import { Link } from "react-router-dom";
import { entityLabel } from "../../lib/entity-label";

const LINK = "text-slate-700 hover:underline";

export function CurrentAssignmentSection({ assignment }: { assignment: Record<string, unknown> }) {
  const unit = assignment.attached_to_unit as Record<string, unknown> | null;
  const load = assignment.current_load as Record<string, unknown> | null;
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Current assignment</h2>
      <p className="mt-2 text-xs text-gray-700">
        Attached truck:{" "}
        {unit?.unit_id ? (
          <Link to={`/fleet/units/${String(unit.unit_id)}`} className={LINK}>
            {entityLabel(unit.unit_number, unit.unit_id, "Unit")}
          </Link>
        ) : (
          "None"
        )}
      </p>
      <p className="text-xs text-gray-700">
        Current load:{" "}
        {load?.load_id ? (
          <Link to={`/dispatch/loads/${String(load.load_id)}`} className={LINK}>
            {entityLabel(load.load_number, load.load_id, "Load")} ({String(load.status ?? "—")})
          </Link>
        ) : (
          "None"
        )}
      </p>
    </section>
  );
}
