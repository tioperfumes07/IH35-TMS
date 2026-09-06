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
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

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
  const displayedLegs: StopsRecordLeg[] = legs.length > 0 ? legs : [
    { leg_index: 0, leg_kind: "deadhead_to_pickup", from_label: "Yard", to_label: "Pickup (deadhead, attributed to this pickup)", practical_miles: null, short_miles: null, real_miles: null, google_reference_miles: null },
    { leg_index: 1, leg_kind: "loaded", from_label: "Pickup", to_label: "Delivery", practical_miles: load.miles_practical, short_miles: load.miles_shortest, real_miles: null, google_reference_miles: null },
  ];
  const columns: Array<ParityColumn<StopsRecordLeg>> = [
    { key: "leg", label: "Leg", render: (leg) => `${leg.from_label} → ${leg.to_label}` },
    { key: "practical_miles", label: "Practical", render: (leg) => fmtMiles(leg.practical_miles), cellClass: "text-right tabular-nums" },
    { key: "short_miles", label: "Short", render: (leg) => fmtMiles(leg.short_miles), cellClass: "text-right tabular-nums" },
    { key: "real_miles", label: "Real", render: (leg) => fmtMiles(leg.real_miles), cellClass: "text-right tabular-nums" },
    { key: "google_reference_miles", label: "Google ref", render: (leg) => fmtMiles(leg.google_reference_miles), cellClass: "text-right tabular-nums" },
  ];
  return (
    <StopsPopup title="Leg miles" onClose={onClose}>
      <ParityTable rows={displayedLegs} columns={columns} rowKey={(leg) => String(leg.leg_index)} tableTestId="stops-record-legs-table" rowTestId={() => "stops-record-leg-row"} storageKey="load-stops-record-legs" suppressToolbarSearch suppressToolbarRange initialPageSize={25} />
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
      <div className="ldt-rows" data-testid="stops-record-detail-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="ldt-row grid grid-cols-2 border-b border-gray-100 px-2 py-1">
            <span className="text-gray-500">{k}</span>
            <span className="text-right text-gray-800">{v}</span>
          </div>
        ))}
      </div>
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
  const stopColumns: Array<ParityColumn<StopsRecordStop>> = [
    { key: "sequence", label: "#" },
    { key: "stop_type", label: "Type", render: (stop) => stopTypeLabel(stop.stop_type) },
    { key: "location", label: "Location", render: (stop) => <>{locationText(stop)}{stop.geocode_missing ? <span className="ml-1 inline-flex rounded-sm bg-[#f6e3df] px-1.5 py-0.5 text-xs font-medium text-[#93301f]">Geocode missing</span> : null}</> },
    { key: "appointment", label: "Appt window", render: appointmentText },
    { key: "arrived_at", label: "Arrived", render: (stop) => fmtTs(stop.arrived_at), cellClass: "tabular-nums" },
    { key: "departed_at", label: "Departed", render: (stop) => fmtTs(stop.departed_at), cellClass: "tabular-nums" },
    { key: "dwell_minutes", label: "Dwell", render: (stop) => fmtDuration(stop.dwell_minutes), cellClass: "tabular-nums" },
    { key: "detention_minutes", label: "Detention", render: (stop) => stop.detention_minutes > 0 ? <span className="text-[#93301f]">{fmtDuration(stop.detention_minutes)}</span> : DASH, cellClass: "tabular-nums" },
    { key: "source", label: "Source" },
    { key: "doc_count", label: "Docs", cellClass: "tabular-nums" },
  ];

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
        <ParityTable rows={stops} columns={stopColumns} rowKey={(stop) => stop.stop_id} onRowClick={setOpenStop} tableTestId="stops-record-table" rowTestId={() => "stops-record-row"} storageKey="load-stops-record" minWidthPx={900} suppressToolbarSearch suppressToolbarRange initialPageSize={25} />
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
