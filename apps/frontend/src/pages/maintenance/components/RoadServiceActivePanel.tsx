import type { WorkOrder } from "../../../api/maintenance";

type Props = {
  roadside: WorkOrder[];
  onOpen: (id: string) => void;
};

// Compact sidebar panel mirroring the approved rm-status-board.html "ROAD SERVICE ACTIVE" panel.
// §7 palette only — navy #1F2A44 heading, red #A32D2D for OOS/critical; no blue/indigo/green.
export function RoadServiceActivePanel({ roadside, onOpen }: Props) {
  // Active = not yet completed. Roadside payload is already location-bucketed by the board query.
  const active = roadside.filter((wo) => wo.status !== "complete");

  return (
    <section className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="flex items-center justify-between bg-gray-50 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Road Service Active</span>
        <span className="rounded bg-white px-1.5 text-[10px] font-bold text-gray-600">{active.length}</span>
      </div>
      {active.length === 0 ? (
        <div className="px-2 py-1.5 text-[11px] text-gray-400">No active road service</div>
      ) : (
        <ul className="flex flex-col">
          {active.map((wo) => {
            const isOos = (wo.severity ?? "").toLowerCase() === "severe";
            const where = wo.roadside_location ?? wo.roadside_provider_name ?? null;
            const eta =
              wo.roadside_response_minutes != null ? `ETA ${wo.roadside_response_minutes} min` : null;
            return (
              <li key={wo.id} className="border-t border-gray-100 first:border-t-0">
                <button
                  type="button"
                  onClick={() => onOpen(wo.id)}
                  className="block w-full px-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: isOos ? "#A32D2D" : "#1F2A44" }}
                    >
                      {wo.unit_number ?? wo.display_id ?? wo.unit_id}
                    </span>
                    {isOos ? (
                      <span className="text-[9px] font-bold tracking-wide" style={{ color: "#A32D2D" }}>
                        OOS
                      </span>
                    ) : null}
                  </div>
                  {where ? <div className="truncate text-[10px] text-gray-500">{where}</div> : null}
                  <div className="flex items-center justify-between gap-1 text-[9.5px] text-gray-400">
                    <span>{wo.status}</span>
                    {eta ? <span>{eta}</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
