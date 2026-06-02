import { Link } from "react-router-dom";

export function CurrentAssignmentSection({
  assignment,
  companyId,
  driverId,
  onSetDefault,
}: {
  assignment: Record<string, unknown>;
  companyId: string;
  driverId: string;
  onSetDefault?: (unitId: string) => void;
}) {
  const def = assignment.default_truck as Record<string, unknown> | null;
  const cur = assignment.currently_driving_truck as Record<string, unknown> | null;
  const load = assignment.current_load as Record<string, unknown> | null;

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Current assignment</h2>
      <div className="grid gap-3 text-xs text-slate-700 md:grid-cols-3">
        <div>
          <div className="font-semibold text-slate-800">Default truck</div>
          {def ? (
            <Link to={`/fleet/${def.unit_id}?operating_company_id=${companyId}`} className="text-sky-700 hover:underline">
              {String(def.unit_number ?? def.unit_id)}
            </Link>
          ) : (
            <span>—</span>
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-800">Currently driving</div>
          {cur ? (
            <>
              <Link to={`/fleet/${cur.unit_id}?operating_company_id=${companyId}`} className="text-sky-700 hover:underline">
                {String(cur.unit_number ?? cur.unit_id)}
              </Link>
              {cur.samsara_logged_in_at ? (
                <div className="text-slate-500">Samsara {String(cur.samsara_logged_in_at)}</div>
              ) : null}
            </>
          ) : (
            <span>—</span>
          )}
        </div>
        <div>
          <div className="font-semibold text-slate-800">Current load</div>
          {load ? (
            <Link to={`/loads/${load.load_id}`} className="text-sky-700 hover:underline">
              {String(load.load_number ?? load.load_id)} · {String(load.status ?? "—")}
            </Link>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
      {onSetDefault ? (
        <p className="mt-2 text-xs text-slate-500">
          Set default truck from fleet unit profile or POST default-truck for driver {driverId.slice(0, 8)}…
        </p>
      ) : null}
    </section>
  );
}
