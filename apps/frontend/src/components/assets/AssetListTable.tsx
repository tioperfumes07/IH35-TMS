import type { AssetLifecycle, AssetRow } from "./types";

type Props = {
  rows: AssetRow[];
  isLoading: boolean;
};

const LIFECYCLE_BADGE: Record<AssetLifecycle, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  maintenance: "bg-amber-50 text-amber-700 border-amber-200",
  out_of_service: "bg-red-50 text-red-700 border-red-200",
};

function LifecyclePill({ value }: { value: AssetLifecycle }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${LIFECYCLE_BADGE[value]}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function AssetListTable({ rows, isLoading }: Props) {
  return (
    <section className="overflow-hidden rounded border border-gray-200 bg-white">
      <header className="border-b border-gray-200 px-3 py-2">
        <h2 className="text-sm font-semibold text-gray-900">Asset register</h2>
      </header>
      {isLoading ? (
        <p className="px-3 py-8 text-sm text-gray-500">Loading assets…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-8 text-sm text-gray-500">No assets found for this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Lifecycle</th>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Assigned load</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-right">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <p className="font-medium text-gray-900">{row.unit_number}</p>
                    <p className="text-xs text-gray-500">{row.vin || "VIN pending"}</p>
                  </td>
                  <td className="px-3 py-2 capitalize text-gray-700">{row.kind}</td>
                  <td className="px-3 py-2">
                    <LifecyclePill value={row.lifecycle} />
                  </td>
                  <td className="px-3 py-2 text-gray-700">{row.assigned_driver_name || "Unassigned"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.assigned_load_display || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.location_label || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                    {row.utilization_score == null ? "—" : `${Math.round(row.utilization_score)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
