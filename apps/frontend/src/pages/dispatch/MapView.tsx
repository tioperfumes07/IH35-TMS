import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { resolveApiUrl } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";

type MapPosition = {
  load_uuid: string;
  driver_uuid?: string | null;
  lat: number;
  lng: number;
  speed_mph: number | null;
  stale: boolean;
};

async function fetchPositions(companyId: string) {
  const res = await fetch(resolveApiUrl(`/api/integrations/samsara/positions/active-loads?operating_company_id=${companyId}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("fetch_failed");
  return res.json() as Promise<{ positions?: MapPosition[] }>;
}

function pinColor(speed: number | null | undefined, stale: boolean): string {
  if (stale) return "#dc2626";
  if (speed != null && speed < 2) return "#ca8a04";
  return "#16a34a";
}

export function MapView() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  // Honor both canonical load_id and legacy ?load= (LoadLivePositionCell / older queue links).
  const focusLoadId = searchParams.get("load_id") ?? searchParams.get("load");
  const focusDriverId = searchParams.get("driver");

  const query = useQuery({
    queryKey: ["dispatch", "map-positions", companyId],
    queryFn: () => fetchPositions(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const positions = query.data?.positions ?? [];
  const focused = positions.filter((p) => {
    if (focusLoadId && p.load_uuid === focusLoadId) return true;
    if (focusDriverId && p.driver_uuid === focusDriverId) return true;
    return false;
  });
  const hasFocus = Boolean(focusLoadId || focusDriverId);
  const ordered = hasFocus ? [...focused, ...positions.filter((p) => !focused.includes(p))] : positions;

  return (
    <div className="space-y-3 p-4" data-testid="dispatch-map-view">
      <h1 className="text-lg font-semibold">Active Load Map (CAP-1)</h1>
      {hasFocus ? (
        <p className="text-xs text-slate-600" data-testid="dispatch-map-focus">
          {focused.length > 0
            ? `Showing ${focused.length} matching position(s) first.`
            : "No GPS match for this driver/load yet — showing all active loads."}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((p) => {
          const isMatch =
            (focusLoadId != null && p.load_uuid === focusLoadId) ||
            (focusDriverId != null && p.driver_uuid === focusDriverId);
          return (
            <button
              key={p.load_uuid}
              type="button"
              className={`rounded-sm border p-2 text-left text-xs ${isMatch ? "ring-2 ring-slate-700" : ""}`}
              style={{ borderColor: pinColor(p.speed_mph, p.stale) }}
              data-focused={isMatch ? "true" : undefined}
            >
              <div className="font-semibold">Load {p.load_uuid.slice(0, 8)}</div>
              <div>
                {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
              </div>
            </button>
          );
        })}
        {positions.length === 0 ? <p className="text-sm text-slate-500">No in-transit loads with GPS.</p> : null}
      </div>
    </div>
  );
}
