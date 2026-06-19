import type { UnitsWithoutLoad, UnitLiveLocation } from "../../../api/dispatch";

type Props = {
  rows: UnitsWithoutLoad[];
  onRowClick: (row: UnitsWithoutLoad) => void;
};

function idleClass(hours: number | null) {
  if (hours === null) return "text-gray-500";
  if (hours >= 72) return "font-bold text-red-700";
  if (hours >= 48) return "font-semibold text-red-700";
  if (hours >= 24) return "text-red-600";
  return "text-gray-700";
}

// Live Samsara location cell — city/state (reverse-geo) + "as of HH:MM CT"; gold dot when the fix is stale.
// Shown for EVERY unit regardless of load state; "—" when Samsara has no recent fix.
function LocationCell({ loc }: { loc: UnitLiveLocation | null }) {
  if (!loc) return <span className="text-gray-400">—</span>;
  const place = [loc.city, loc.state].filter(Boolean).join(", ") || loc.formatted || "Unknown";
  return (
    <span title={loc.formatted ?? undefined}>
      {loc.stale ? <span className="mr-1 text-amber-500" title={`stale · last fix ${loc.captured_at_ct}`}>●</span> : null}
      {place}
      <span className="ml-1 text-[10px] text-gray-400">· as of {loc.captured_at_ct}</span>
    </span>
  );
}

export function UnitsWithoutLoadTable({ rows, onRowClick }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-full text-left text-[11px]">
        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
          <tr>
            {["Unit", "Trailer", "Driver", "Current Location", "Last Drop · Status", "Hours Since", "Idle Time"].map((header) => (
              <th key={header} className="px-2 py-1">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} onClick={() => onRowClick(row)} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50">
              <td className="px-2 py-1 font-semibold">{row.unit_number}</td>
              <td className="px-2 py-1">{row.trailer_number ?? "-"}</td>
              <td className="px-2 py-1">{row.driver_name ?? "-"}</td>
              <td className="px-2 py-1"><LocationCell loc={row.location} /></td>
              <td className="px-2 py-1">
                {row.last_drop_at ? new Date(row.last_drop_at).toLocaleString() : "No prior drop"} ·
                <span className="ml-1 text-amber-700">Need Load</span>
              </td>
              <td className={`px-2 py-1 ${idleClass(row.hours_since_last_delivery)}`}>
                {row.hours_since_last_delivery ?? "-"}
              </td>
              <td className={`px-2 py-1 ${idleClass(row.hours_since_last_delivery)}`}>
                {row.hours_since_last_delivery !== null && row.hours_since_last_delivery >= 72 ? "⚠ " : ""}
                {row.hours_since_last_delivery !== null ? `${row.hours_since_last_delivery}h idle` : "-"}
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-2 py-3 text-center text-gray-500">All units currently have active loads.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
