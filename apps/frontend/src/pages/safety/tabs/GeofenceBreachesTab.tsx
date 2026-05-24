import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeBreach, listGeofenceBreaches, type GeofenceBreachFilter } from "../../../api/safetyGeofence";
import { useCompanyContext } from "../../../contexts/CompanyContext";

const FILTERS: GeofenceBreachFilter[] = ["active", "acknowledged", "all"];

export function GeofenceBreachesTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<GeofenceBreachFilter>("active");

  const eventsQuery = useQuery({
    queryKey: ["safety", "geofence-breaches", companyId, filter],
    queryFn: () => listGeofenceBreaches({ operating_company_id: companyId, filter }),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => acknowledgeBreach(id, companyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "geofence-breaches", companyId] });
    },
  });

  const activeCount = useMemo(
    () => (eventsQuery.data?.events ?? []).filter((event) => !event.acknowledged_at).length,
    [eventsQuery.data?.events]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Geofence Alerts</h3>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{activeCount} active</span>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded px-2 py-1 text-xs ${filter === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {(eventsQuery.data?.events ?? []).map((event) => (
          <div key={event.id} className="rounded border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${event.event_type === "entry" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {event.event_type}
                </span>
                <span className="text-sm font-medium text-slate-900">Unit {event.unit_number ?? event.vehicle_id.slice(0, 8)}</span>
              </div>
              <span className="text-xs text-slate-500">{new Date(event.event_at).toLocaleString()}</span>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Geofence: {event.geofence_label ?? event.geofence_id} · Customer: {event.customer_name ?? "N/A"} · Position:{" "}
              {Number(event.position_lat).toFixed(5)}, {Number(event.position_lng).toFixed(5)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {event.acknowledged_at ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  className="rounded bg-blue-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={acknowledgeMutation.isPending}
                  onClick={() => acknowledgeMutation.mutate(event.id)}
                >
                  Acknowledge
                </button>
              )}
            </div>
          </div>
        ))}
        {eventsQuery.isLoading ? <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-500">Loading geofence alerts...</div> : null}
        {!eventsQuery.isLoading && (eventsQuery.data?.events ?? []).length === 0 ? (
          <div className="rounded border border-gray-200 bg-white p-3 text-xs text-slate-500">No geofence alerts for selected filter.</div>
        ) : null}
      </div>
    </div>
  );
}
