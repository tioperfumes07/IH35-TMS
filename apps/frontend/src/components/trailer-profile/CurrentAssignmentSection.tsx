import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export function CurrentAssignmentSection({
  assignment,
}: {
  assignment: Record<string, unknown>;
}) {
  const unit = assignment.attached_to_unit as Record<string, unknown> | null;
  const load = assignment.current_load as Record<string, unknown> | null;
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">
        Current assignment
      </h2>
      <p className="mt-2 text-xs text-gray-700">
        Attached truck:{" "}
        {unit?.unit_id ? (
          <EntityLinkOrTombstone
            kind="unit"
            id={String(unit.unit_id)}
            name={unit.unit_number}
            noun="Unit"
          />
        ) : (
          "None"
        )}
      </p>
      <p className="text-xs text-gray-700">
        Current load:{" "}
        {load?.load_id ? (
          <EntityLinkOrTombstone
            kind="load"
            id={String(load.load_id)}
            name={load.load_number}
            noun="Load"
          />
        ) : (
          "None"
        )}
      </p>
      {load?.load_id ? <p className="text-xs text-gray-500">Status: {String(load.status ?? "—")}</p> : null}
    </section>
  );
}
