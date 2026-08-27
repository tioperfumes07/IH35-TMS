import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeBreach, listGeofenceBreaches, type GeofenceBreachFilter } from "../../../api/safetyGeofence";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { userFacingApiError } from "../../../lib/api-error-message";

const FILTERS: GeofenceBreachFilter[] = ["active", "acknowledged", "all"];

/** @matrix-built modules=safety,dispatch cols=unit,customer,connectivity,reverse_link */

export function GeofenceBreachesTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<GeofenceBreachFilter>("active");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const companyGenerationRef = useRef(0);

  const eventsQuery = useQuery({
    queryKey: ["safety", "geofence-breaches", companyId, filter, page],
    queryFn: () => listGeofenceBreaches({ operating_company_id: companyId, filter, page_size: pageSize, offset: page * pageSize }),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; breachId: string }) =>
      acknowledgeBreach(input.breachId, input.companyId),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "geofence-breaches", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    acknowledgeMutation.reset();
    setFilter("active");
    setPage(0);
  }, [companyId]);

  const activeCount = eventsQuery.data?.active_count ?? 0;
  const totalCount = eventsQuery.data?.total_count ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-sm border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Geofence Alerts</h3>
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
            {eventsQuery.isError ? "—" : `${activeCount} active`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setFilter(item); setPage(0); }}
              className={`rounded-sm px-2 py-1 text-xs ${filter === item ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {eventsQuery.isError ? (
          <p className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700" data-testid="geofence-breaches-query-error">
            {userFacingApiError(eventsQuery.error, "Could not load geofence alerts.")}
          </p>
        ) : (
          <>
            {(eventsQuery.data?.events ?? []).map((event) => (
          <div key={event.id} className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${event.event_type === "entry" ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-700"}`}>
                  {event.event_type}
                </span>
                <span className="text-sm font-medium text-slate-900">Unit <EntityLink kind="unit" id={event.vehicle_id} label={entityLabel(event.unit_number, event.vehicle_id, "Unit")} /></span>
              </div>
              <span className="text-xs text-slate-500">{formatDateTimeUS(event.event_at)} CT</span>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              {/* LINK reverse_link: geofence_label was dead text with no drill-through — EntityLink
                  kind="geofence" now resolves to /dispatch/geofencing?geofence_id= (GeofencesPage,
                  which honors that param and highlights the row). */}
              Geofence:{" "}
              {event.geofence_id ? (
                <EntityLink kind="geofence" id={event.geofence_id} label={entityLabel(event.geofence_label, event.geofence_id, "Geofence")} />
              ) : (
                entityLabel(event.geofence_label, event.geofence_id, "Geofence")
              )}{" "}
              · Customer:{" "}
              {event.customer_id ? (
                <EntityLink kind="customer" id={event.customer_id} label={entityLabel(event.customer_name, event.customer_id, "Customer")} />
              ) : (
                entityLabel(event.customer_name, event.customer_id, "Customer")
              )}{" "}
              · Position: {Number(event.position_lat).toFixed(5)}, {Number(event.position_lng).toFixed(5)}
            </div>
            <div className="mt-2 flex items-center gap-2">
              {event.acknowledged_at ? (
                <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Acknowledged</span>
              ) : (
                <button
                  type="button"
                  className="rounded-sm bg-[#1F2A44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={acknowledgeMutation.isPending}
                  onClick={() =>
                    acknowledgeMutation.mutate({
                      companyId,
                      generation: companyGenerationRef.current,
                      breachId: event.id,
                    })
                  }
                >
                  Acknowledge
                </button>
              )}
            </div>
          </div>
            ))}
            {eventsQuery.isLoading ? <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-500">Loading geofence alerts...</div> : null}
            {!eventsQuery.isLoading && (eventsQuery.data?.events ?? []).length === 0 ? (
              <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-500">No geofence alerts for selected filter.</div>
            ) : null}
          </>
        )}
        {acknowledgeMutation.isError &&
        acknowledgeMutation.variables?.generation === companyGenerationRef.current ? (
          <p className="text-xs text-red-700" data-testid="geofence-acknowledge-error">
            {userFacingApiError(acknowledgeMutation.error, "Could not acknowledge the geofence breach.")}
          </p>
        ) : null}
        {!eventsQuery.isError && totalCount > 0 ? (
          <div className="flex items-center justify-between text-xs text-slate-600" data-testid="geofence-breaches-server-pager">
            <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount}</span>
            <div className="flex gap-2">
              <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-50" disabled={page === 0 || eventsQuery.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button>
              <button type="button" className="rounded-sm border px-2 py-1 disabled:opacity-50" disabled={(page + 1) * pageSize >= totalCount || eventsQuery.isFetching} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
