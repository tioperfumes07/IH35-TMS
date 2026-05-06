import type { RecommendedStop } from "../../../api/fuelPlanner";

type Props = {
  stops: RecommendedStop[];
};

export function StopReasoningTable({ stops }: Props) {
  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="min-w-[900px] w-full text-left text-xs">
        <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
          <tr>
            <th className="px-2 py-1">#</th>
            <th className="px-2 py-1">Station</th>
            <th className="px-2 py-1">State/Mile</th>
            <th className="px-2 py-1">$/gal</th>
            <th className="px-2 py-1">Gallons</th>
            <th className="px-2 py-1">Why This Stop</th>
            <th className="px-2 py-1">HOS</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((stop, idx) => {
            const skipped = Boolean(stop.is_skipped);
            return (
              <tr key={stop.id || idx} className={`border-t border-gray-100 ${skipped ? "bg-red-50" : ""}`}>
                <td className="px-2 py-1">{idx + 1}</td>
                <td className={`px-2 py-1 ${skipped ? "text-red-700 line-through" : ""}`}>{stop.station_name ?? "—"}</td>
                <td className="px-2 py-1">{String(stop.station_state ?? stop.state ?? "")} / {Number(stop.mile_marker ?? 0).toFixed(0)}</td>
                <td className="px-2 py-1">${Number(stop.price_per_gallon ?? 0).toFixed(2)}</td>
                <td className="px-2 py-1">{Number(stop.gallons_added ?? stop.gallons ?? 0).toFixed(1)}</td>
                <td className="px-2 py-1">
                  {String(stop.reasoning_json?.why_this_stop ?? stop.reasoning_json?.reason ?? "No reasoning")}
                </td>
                <td className="px-2 py-1">{String(stop.hos_note ?? stop.reasoning_json?.hos ?? "—")}</td>
              </tr>
            );
          })}
          {stops.length === 0 ? (
            <tr><td colSpan={7} className="px-2 py-3 text-center text-gray-500">No recommended stops yet.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
