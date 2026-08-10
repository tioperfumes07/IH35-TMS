import { EntityLink } from "../parity/EntityLink";
import { entityLabel } from "../../lib/entity-label";

export function CurrentLoadSection({
  currentLoad,
  unitId,
}: {
  currentLoad: Record<string, unknown> | null;
  unitId: string;
}) {
  if (!currentLoad) {
    return (
      <section className="rounded-sm border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-800">Current load</h3>
        <p className="mt-1">Available — no active load assigned to unit {entityLabel(null, unitId, "Unit")}.</p>
      </section>
    );
  }
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Current load</h3>
      <p className="mt-1 text-sm">
        Load {String(currentLoad.load_number)} · {String(currentLoad.pickup ?? "?")} → {String(currentLoad.delivery ?? "?")}
      </p>
      <p className="text-xs text-gray-600">
        Customer: {String(currentLoad.customer ?? "—")} · ETA {String(currentLoad.eta ?? "—")} · Status {String(currentLoad.status)}
      </p>
      {currentLoad.load_id ? (
        <EntityLink
          kind="load"
          id={String(currentLoad.load_id)}
          label={String(currentLoad.load_number ?? currentLoad.load_id)}
          className="mt-2 inline-block text-xs font-semibold text-slate-700 underline"
        />
      ) : null}
    </section>
  );
}
