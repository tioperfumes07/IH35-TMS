import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";

async function fetchPositions(companyId: string) {
  const res = await fetch(`/api/integrations/samsara/positions/active-loads?operating_company_id=${companyId}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("fetch_failed");
  return res.json();
}

function pinColor(speed: number | null | undefined, stale: boolean): string {
  if (stale) return "#dc2626";
  if (speed != null && speed < 2) return "#ca8a04";
  return "#16a34a";
}

export function MapView() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const query = useQuery({
    queryKey: ["dispatch", "map-positions", companyId],
    queryFn: () => fetchPositions(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const positions = query.data?.positions ?? [];

  return (
    <div className="space-y-3 p-4" data-testid="dispatch-map-view">
      <h1 className="text-lg font-semibold">Active Load Map (CAP-1)</h1>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {positions.map((p: { load_uuid: string; lat: number; lng: number; speed_mph: number | null; stale: boolean }) => (
          <button
            key={p.load_uuid}
            type="button"
            className="rounded border p-2 text-left text-xs"
            style={{ borderColor: pinColor(p.speed_mph, p.stale) }}
          >
            <div className="font-semibold">Load {p.load_uuid.slice(0, 8)}</div>
            <div>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div>
          </button>
        ))}
        {positions.length === 0 ? <p className="text-sm text-slate-500">No in-transit loads with GPS.</p> : null}
      </div>
    </div>
  );
}
