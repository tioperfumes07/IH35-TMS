import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { resolveApiUrl } from "../../api/client";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { isDispatchMapProviderConfigured } from "../../lib/dispatch-map-provider";

type MapPosition = {
  load_uuid: string;
  unit_uuid: string;
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

export function MapView() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  // Honor both canonical load_id and legacy ?load= (LoadLivePositionCell / older queue links).
  const focusLoadId = searchParams.get("load_id") ?? searchParams.get("load");
  const focusDriverId = searchParams.get("driver");
  const focusUnitId = searchParams.get("unit_id");
  const mapConfigured = isDispatchMapProviderConfigured();

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
    if (focusUnitId && p.unit_uuid === focusUnitId) return true;
    return false;
  });
  const hasFocus = Boolean(focusLoadId || focusDriverId || focusUnitId);

  return (
    <div className="space-y-3 p-4" data-testid="dispatch-map-view">
      <h1 className="text-lg font-semibold">Active Load Map</h1>
      {!companyId ? (
        <p
          className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
          data-testid="dispatch-map-need-company"
        >
          Select an operating company to load entity-scoped GPS positions for active loads.
        </p>
      ) : null}
      {companyId && query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Could not load GPS positions")}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {hasFocus ? (
        <p className="text-xs text-slate-600" data-testid="dispatch-map-focus">
          {focused.length > 0
            ? `${focused.length} matching position(s) from Samsara — map plotting unavailable until a map provider is configured.`
            : "No GPS match for this driver/load/unit yet."}
        </p>
      ) : null}
      {companyId && !mapConfigured ? (
        <section
          className="rounded-sm border border-gray-200 bg-white p-6 text-center"
          data-testid="dispatch-map-not-configured"
          data-dispatch-map-honest-empty="true"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <MapPin className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Map provider not configured</h2>
          <p className="mt-1 text-sm text-gray-600">
            Live GPS from Samsara is available for active loads, but geographic map rendering is not wired yet.
            Contact the owner or administrator to configure a map provider (Mapbox) before this view can plot
            vehicle positions.
          </p>
          {!query.isError && positions.length > 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              {positions.length} active load{positions.length === 1 ? "" : "s"} with GPS — positions are not shown here
              until map rendering is enabled (no fake map pins).
            </p>
          ) : null}
          {!query.isError && !query.isLoading && positions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-700" data-testid="dispatch-map-positions-honest-empty">
              No in-transit loads with GPS for this company right now. Positions appear when Samsara reports an active
              load with coordinates.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
