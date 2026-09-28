import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { userFacingApiError } from "../../lib/api-error-message";
import { isDispatchMapProviderConfigured } from "../../lib/dispatch-map-provider";
import { PageHeader } from "../../components/forms/shared/PageHeader";

type MapPosition = {
  load_uuid: string;
  unit_uuid: string;
  driver_uuid?: string | null;
  lat: number;
  lng: number;
  speed_mph: number | null;
  stale: boolean;
};

// ROUND 203 F19 — use apiRequest (shared error/telemetry), encode companyId, always render
// position list when data exists (including when mapConfigured — was a dead path).
async function fetchPositions(companyId: string) {
  return apiRequest<{ positions?: MapPosition[] }>(
    `/api/integrations/samsara/positions/active-loads?operating_company_id=${encodeURIComponent(companyId)}`
  );
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
  const listRows = hasFocus ? focused : positions;

  return (
    <div className="space-y-3 p-4" data-testid="dispatch-map-view">
      <PageHeader title="Active Load Map" breadcrumb={[{ label: "Dispatch" }, { label: "Map" }]} backHref="/dispatch" />
      {!companyId ? (
        <p
          className="rounded-sm border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700"
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
            ? `${focused.length} matching position(s) from Samsara${mapConfigured ? "" : " — map plotting unavailable until a map provider is configured"}.`
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
          <h2 className="text-page-title font-semibold text-gray-900">Map provider not configured</h2>
          <p className="mt-1 text-xs text-gray-600">
            Live GPS from Samsara is available for active loads, but geographic map rendering is not wired yet.
            Contact the owner or administrator to configure a map provider (Mapbox) before this view can plot
            vehicle positions.
          </p>
        </section>
      ) : null}
      {companyId && mapConfigured ? (
        <section
          className="rounded-sm border border-gray-200 bg-white p-4"
          data-testid="dispatch-map-configured"
        >
          <p className="text-xs text-slate-600">
            Map provider is configured. Position list below is live from Samsara; geographic tiles land in a
            follow-up once the Mapbox surface is wired to these coordinates.
          </p>
        </section>
      ) : null}
      {companyId && !query.isError && listRows.length > 0 ? (
        <ul
          className="rounded-sm border border-gray-200 bg-white divide-y divide-gray-100 text-xs"
          data-testid="dispatch-map-positions-list"
        >
          {listRows.map((p) => (
            <li key={`${p.load_uuid}-${p.unit_uuid}`} className="flex flex-wrap gap-3 px-3 py-2 text-slate-700">
              <span>Load {p.load_uuid.slice(0, 8)}</span>
              <span>Unit {p.unit_uuid.slice(0, 8)}</span>
              <span>
                {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
              </span>
              <span>{p.speed_mph != null ? `${p.speed_mph} mph` : "—"}</span>
              {p.stale ? <span className="text-slate-600">stale</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {companyId && !query.isError && !query.isLoading && positions.length === 0 ? (
        <p className="text-xs text-slate-700" data-testid="dispatch-map-positions-honest-empty">
          No in-transit loads with GPS for this company right now. Positions appear when Samsara reports an active
          load with coordinates.
        </p>
      ) : null}
    </div>
  );
}
