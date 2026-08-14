import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

export function CurrentAssignmentSection({
  assignment,
  companyId: _companyId,
  driverId,
  onSetDefault,
}: {
  assignment: Record<string, unknown>;
  /** Kept for caller API stability; unit/load links no longer need opco query params. */
  companyId: string;
  driverId: string;
  onSetDefault?: (unitId: string) => void;
}) {
  void _companyId;
  const def = assignment.default_truck as Record<string, unknown> | null;
  const cur = assignment.currently_driving_truck as Record<
    string,
    unknown
  > | null;
  const load = assignment.current_load as Record<string, unknown> | null;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">
        Current assignment
      </h2>
      <div className="grid gap-3 text-xs text-slate-700 md:grid-cols-3">
        <div>
          <div className="font-semibold text-slate-800">Default truck</div>
          {def ? (
            <EntityLink
              kind="unit"
              id={String(def.unit_id)}
              label={entityLabel(def.unit_number, def.unit_id, "Unit")}
            />
          ) : (
            <span>—</span>
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-800">Currently driving</div>
          {cur ? (
            <>
              <EntityLink
                kind="unit"
                id={String(cur.unit_id)}
                label={entityLabel(cur.unit_number, cur.unit_id, "Unit")}
              />
              {cur.samsara_logged_in_at ? (
                <div className="text-slate-500">
                  Samsara {String(cur.samsara_logged_in_at)}
                </div>
              ) : null}
            </>
          ) : (
            <span>—</span>
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-800">Current load</div>
          {load ? (
            <EntityLink
              kind="load"
              id={String(load.load_id)}
              label={`${entityLabel(load.load_number, load.load_id, "Load")} · ${String(load.status ?? "—")}`}
            />
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
      {onSetDefault ? (
        <p className="mt-2 text-xs text-slate-500">
          Set default truck from fleet unit profile or POST default-truck for
          driver{" "}
          <EntityLink
            kind="driver"
            id={driverId}
            label={entityLabel(null, driverId, "Driver")}
          />
        </p>
      ) : null}
    </section>
  );
}
