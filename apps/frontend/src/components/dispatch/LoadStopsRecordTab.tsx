import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  geocodeDispatchLoadStops,
  getLoadStopsRecord,
  type StopsRecordEvent,
  type StopsRecordLeg,
  type StopsRecordResponse,
  type StopsRecordStop,
} from "../../api/dispatch";
import { Button } from "../Button";

type Props = {
  loadId: string;
  operatingCompanyId: string;
  onEditStops?: () => void;
};

// LDT-2 — the Stops tab is a read-only RECORD of what happened. Every editable field
// (Type, Address, City, ST, ZIP, windows, signature/photo, lumper, contact, dock) is
// edited in the Book Load wizard §C — never inline here (guard: no text fields in this body).

const DASH = "—";

function fmtMiles(v: number | null | undefined): string {
  // Unknown miles are a dash, never 0.0 — a real 0.0 would be a wrong claim (guard).
  if (v == null) return DASH;
  return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return DASH;
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes < 0) return DASH;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function stopTypeLabel(t: string): string {
  if (t === "pickup") return "Pickup";
  if (t === "delivery") return "Delivery";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function appointmentText(stop: StopsRecordStop): string {
  if (stop.appointment_start_at) {
    const start = fmtTs(stop.appointment_start_at);
    if (stop.appointment_end_at) return `${start} – ${fmtTs(stop.appointment_end_at)}`;
    return start;
  }
  if (stop.scheduled_arrival_at) return fmtTs(stop.scheduled_arrival_at);
  return DASH;
}

function locationText(stop: StopsRecordStop): string {
  const parts = [stop.address_line1, stop.city, stop.state, stop.postal_code].filter(Boolean);
  return parts.length ? parts.join(", ") : DASH;
}

// Every box is a drill-down pop-up (owner: "i want all those to pop up just like here when we click").
function StopsPopup({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="stops-record-popup"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-sm border border-gray-200 bg-white p-4 text-xs shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-[#0F1219]">{title}</div>
          <button type="button" className="text-gray-400 hover:text-gray-700" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LegMilesPopup({ data, onClose }: { data: StopsRecordResponse; onClose: () => void }) {
  const { legs, load } = data;
  return (
    <StopsPopup title="Leg miles" onClose={onClose}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            <th className="px-2 py-1">Leg</th>
            <th className="px-2 py-1 text-right">Practical</th>
            <th className="px-2 py-1 text-right">Short</th>
            <th className="px-2 py-1 text-right">Real</th>
            <th className="px-2 py-1 text-right">Google ref</th>
          </tr>
        </thead>
        <tbody>
          {legs.length === 0 ? (
            // No load_stop_legs rows: show the two conceptual legs from the load (honest — the
            // deadhead is stored on the load, not on a leg).
            <>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1">Yard → Pickup (deadhead, attributed to this pickup)</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-2 py-1">Pickup → Delivery</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(load.miles_practical)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(load.miles_shortest)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
                <td className="px-2 py-1 text-right tabular-nums">{DASH}</td>
              </tr>
            </>
          ) : (
            legs.map((leg: StopsRecordLeg) => (
              <tr key={leg.leg_index} className="border-b border-gray-100" data-testid="stops-record-leg-row">
                <td className="px-2 py-1">
                  {leg.from_label} → {leg.to_label}
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(leg.practical_miles)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(leg.short_miles)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(leg.real_miles)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtMiles(leg.google_reference_miles)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">
        Deadhead {fmtMiles(load.miles_deadhead)} mi is stored on the load, not on a leg. Real driven miles need an
        odometer reading at each fence — unavailable until the stops are geocoded and the fences fire.
      </p>
    </StopsPopup>
  );
}

function EventsPopup({ data, onClose }: { data: StopsRecordResponse; onClose: () => void }) {
  const { events, stops, geofence_event_count } = data;
  return (
    <StopsPopup title="Arrival & departure events" onClose={onClose}>
      {geofence_event_count === 0 ? (
        <p className="text-xs text-gray-600">
          No geofence events for this load yet ({stops.filter((s) => !s.geocode_missing).length} of {stops.length} stops
          are geocoded). The arrivals and departures below are the recorded actual times; once the stops have
          coordinates, fence entries and exits (with the source) will appear here.
        </p>
      ) : null}
      <div className="mt-2 space-y-1">
        {events.length > 0
          ? events.map((e: StopsRecordEvent, i: number) => (
              <div key={i} className="flex items-start gap-2 border-b border-gray-100 py-1" data-testid="stops-record-event-row">
                <span className="w-28 shrink-0 tabular-nums text-gray-500">{fmtTs(e.occurred_at)}</span>
                <span className="text-gray-800">
                  {e.event_kind === "entered" ? "Entered" : e.event_kind === "exited" ? "Exited" : e.event_kind}
                  {e.sequence != null ? ` stop #${e.sequence}` : ""} — source {e.source}
                </span>
              </div>
            ))
          : stops.map((s) => (
              <div key={s.stop_id} className="border-b border-gray-100 py-1">
                <div className="flex items-start gap-2">
                  <span className="w-28 shrink-0 tabular-nums text-gray-500">{fmtTs(s.arrived_at)}</span>
                  <span className="text-gray-800">
                    Arrived {stopTypeLabel(s.stop_type).toLowerCase()} #{s.sequence} — source {s.source}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-28 shrink-0 tabular-nums text-gray-500">{fmtTs(s.departed_at)}</span>
                  <span className="text-gray-800">
                    Departed {stopTypeLabel(s.stop_type).toLowerCase()} #{s.sequence} — source {s.source}
                  </span>
                </div>
              </div>
            ))}
      </div>
    </StopsPopup>
  );
}

function StopDetailPopup({ stop, onClose }: { stop: StopsRecordStop; onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ["Type", stopTypeLabel(stop.stop_type)],
    ["Location", locationText(stop)],
    ["Appointment", appointmentText(stop)],
    ["Arrived", fmtTs(stop.arrived_at)],
    ["Departed", fmtTs(stop.departed_at)],
    ["Dwell", fmtDuration(stop.dwell_minutes)],
    ["Free time", fmtDuration(stop.free_time_minutes)],
    ["Detention", stop.detention_minutes > 0 ? fmtDuration(stop.detention_minutes) : "None"],
    ["Source", stop.source],
    ["Contact", stop.contact_name ?? DASH],
    ["Dock / gate", stop.gate_dock_text ?? DASH],
    ["Signature", stop.signature_required ? "Required" : "Not required"],
    ["Photo", stop.photo_required ? "Required" : "Not required"],
    [
      "Lumper",
      stop.lumper_required
        ? stop.lumper_amount_cents != null
          ? `Required · $${(stop.lumper_amount_cents / 100).toFixed(2)}`
          : "Required"
        : "No",
    ],
    ["Documents", `${stop.doc_count}`],
  ];
  return (
    <StopsPopup title={`Stop #${stop.sequence} · ${stopTypeLabel(stop.stop_type)}`} onClose={onClose}>
      <table className="w-full">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-gray-100">
              <td className="px-2 py-1 text-gray-500">{k}</td>
              <td className="px-2 py-1 text-right text-gray-800">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {stop.geocode_missing ? (
        <p className="mt-2 text-xs text-[#93301f]">
          No coordinates on file — no arrival fence can fire. Use “Geocode missing” on the tab to run the address
          geocoder; coordinates are never entered by hand.
        </p>
      ) : null}
    </StopsPopup>
  );
}

export function LoadStopsRecordTab({ loadId, operatingCompanyId, onEditStops }: Props) {
  const queryClient = useQueryClient();
  const [pop, setPop] = useState<"legs" | "events" | null>(null);
  const [openStop, setOpenStop] = useState<StopsRecordStop | null>(null);

  const query = useQuery({
    queryKey: ["load-stops-record", loadId, operatingCompanyId],
    queryFn: () => getLoadStopsRecord(loadId, operatingCompanyId),
  });

  const geocodeMutation = useMutation({
    mutationFn: () => geocodeDispatchLoadStops(loadId, operatingCompanyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["load-stops-record", loadId, operatingCompanyId] });
    },
  });

  if (query.isLoading) {
    return <div className="py-8 text-center text-xs text-gray-500">Loading stops record…</div>;
  }

  if (query.error) {
    return (
      <div className="space-y-2 rounded-sm border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700" role="alert">
        <div>Couldn’t load the stops record.</div>
        <Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const data = query.data;
  const stops: StopsRecordStop[] = data?.stops ?? [];
  const anyGeocodeMissing = stops.some((s) => s.geocode_missing);

  return (
    <div className="space-y-3" data-testid="stops-record">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-wide text-[#4B5563]">Stops — what happened</div>
        <div className="flex items-center gap-2">
          {anyGeocodeMissing ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="stop-geocode-missing"
              disabled={geocodeMutation.isPending}
              onClick={() => geocodeMutation.mutate()}
            >
              {geocodeMutation.isPending ? "Geocoding…" : "Geocode missing"}
            </Button>
          ) : null}
          {onEditStops ? (
            <Button type="button" size="sm" variant="secondary" data-testid="stops-record-edit" onClick={onEditStops}>
              Edit stops
            </Button>
          ) : null}
        </div>
      </div>

      {stops.length === 0 ? (
        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
          No stops found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-gray-200">
          <table className="w-full min-w-[900px] text-xs" data-testid="stops-record-table">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Location</th>
                <th className="px-2 py-1.5">Appt window</th>
                <th className="px-2 py-1.5">Arrived</th>
                <th className="px-2 py-1.5">Departed</th>
                <th className="px-2 py-1.5">Dwell</th>
                <th className="px-2 py-1.5">Detention</th>
                <th className="px-2 py-1.5">Source</th>
                <th className="px-2 py-1.5">Docs</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((stop) => (
                <tr
                  key={stop.stop_id}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  data-testid="stops-record-row"
                  onClick={() => setOpenStop(stop)}
                >
                  <td className="px-2 py-1.5 text-gray-800">{stop.sequence}</td>
                  <td className="px-2 py-1.5 text-gray-800">{stopTypeLabel(stop.stop_type)}</td>
                  <td className="px-2 py-1.5 text-gray-700">
                    {locationText(stop)}
                    {stop.geocode_missing ? (
                      <span className="ml-1 inline-flex rounded-sm bg-[#f6e3df] px-1.5 py-0.5 text-xs font-medium text-[#93301f]">
                        Geocode missing
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{appointmentText(stop)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-700">{fmtTs(stop.arrived_at)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-700">{fmtTs(stop.departed_at)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-700">{fmtDuration(stop.dwell_minutes)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-700">
                    {stop.detention_minutes > 0 ? (
                      <span className="text-[#93301f]">{fmtDuration(stop.detention_minutes)}</span>
                    ) : (
                      DASH
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-gray-700">{stop.source}</td>
                  <td className="px-2 py-1.5 tabular-nums text-gray-700">{stop.doc_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {geocodeMutation.isError ? (
        <div className="rounded-sm border border-[#f6e3df] bg-[#f6e3df] px-2 py-1 text-xs text-[#93301f]">
          Geocode failed — {String((geocodeMutation.error as Error)?.message ?? "try again")}.
        </div>
      ) : null}
      {geocodeMutation.data ? (
        <div className="rounded-sm border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600">
          Geocoded {geocodeMutation.data.stops_geocoded} of {geocodeMutation.data.stops_checked} stops
          {geocodeMutation.data.stops_geocode_failed > 0 ? ` · ${geocodeMutation.data.stops_geocode_failed} failed` : ""}.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <button
          type="button"
          className="rounded-sm border border-gray-200 bg-white p-2 text-left hover:bg-gray-50"
          data-testid="stops-record-legs"
          onClick={() => setPop("legs")}
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            Leg miles<span className="text-gray-400">practical · short · real · google ref ↗</span>
          </div>
          <div className="mt-1 text-xs text-gray-700">
            Loaded {fmtMiles(data?.load.miles_practical)} mi practical · deadhead {fmtMiles(data?.load.miles_deadhead)} mi
          </div>
        </button>
        <button
          type="button"
          className="rounded-sm border border-gray-200 bg-white p-2 text-left hover:bg-gray-50"
          data-testid="stops-record-events"
          onClick={() => setPop("events")}
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
            Arrival &amp; departure events<span className="text-gray-400">geo.geofence_events ↗</span>
          </div>
          <div className="mt-1 text-xs text-gray-700">
            {data?.geofence_event_count ?? 0} fence events · {stops.filter((s) => !s.geocode_missing).length} of{" "}
            {stops.length} stops geocoded
          </div>
        </button>
      </div>

      {pop === "legs" && data ? <LegMilesPopup data={data} onClose={() => setPop(null)} /> : null}
      {pop === "events" && data ? <EventsPopup data={data} onClose={() => setPop(null)} /> : null}
      {openStop ? <StopDetailPopup stop={openStop} onClose={() => setOpenStop(null)} /> : null}
    </div>
  );
}
