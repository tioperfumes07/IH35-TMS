import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type StopSource = "geofence" | "driver_pwa" | "dispatcher_manual";
type DetentionStatus = "accruing" | "closed" | "billed" | null;

type GeofenceStop = {
  stop_id: string;
  sequence: number;
  stop_type: string;
  city: string | null;
  state: string | null;
  arrived_at: string | null;
  departed_at: string | null;
  scheduled_arrival_at: string | null;
  dwell_minutes: number | null;
  free_time_minutes: number;
  detention_minutes: number;
  detention_status: DetentionStatus;
  is_layover: boolean;
  source: StopSource;
  stop_status: string;
};

type TimelineResponse = {
  stops: GeofenceStop[];
  load_free_time_minutes: number;
};

type Props = {
  loadId: string;
  operatingCompanyId: string;
};

const SOURCE_BADGE: Record<StopSource, { label: string; className: string }> = {
  geofence: { label: "Geofence auto", className: "bg-emerald-100 text-emerald-800" },
  driver_pwa: { label: "Driver PWA", className: "bg-blue-100 text-blue-800" },
  dispatcher_manual: { label: "Manual", className: "bg-gray-100 text-gray-600" },
};

const DETENTION_BADGE: Record<NonNullable<DetentionStatus>, { label: string; className: string }> = {
  accruing: { label: "Accruing", className: "bg-red-100 text-red-700" },
  closed: { label: "Closed", className: "bg-gray-200 text-gray-600" },
  billed: { label: "Billed", className: "bg-indigo-100 text-indigo-700" },
};

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTs(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DwellBar({
  dwellMinutes,
  freeTimeMinutes,
}: {
  dwellMinutes: number | null;
  freeTimeMinutes: number;
}) {
  if (dwellMinutes === null) {
    return <div className="h-2 w-full rounded-full bg-gray-100" />;
  }

  const maxDisplay = Math.max(dwellMinutes * 1.1, freeTimeMinutes * 1.5, 60);
  const freeTimePct = Math.min(100, (freeTimeMinutes / maxDisplay) * 100);
  const dwellPct = Math.min(100, (dwellMinutes / maxDisplay) * 100);
  const overThreshold = dwellMinutes > freeTimeMinutes;

  return (
    <div className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-gray-100">
      {/* dwell fill */}
      <div
        className={`absolute left-0 top-0 h-full rounded-full ${overThreshold ? "bg-red-400" : "bg-emerald-400"}`}
        style={{ width: `${dwellPct}%` }}
      />
      {/* free-time threshold marker */}
      <div
        className="absolute top-0 h-full w-0.5 bg-gray-500 opacity-70"
        style={{ left: `${freeTimePct}%` }}
        title={`Free time: ${formatDuration(freeTimeMinutes)}`}
      />
    </div>
  );
}

function StopCard({ stop }: { stop: GeofenceStop }) {
  const src = SOURCE_BADGE[stop.source];
  const det = stop.detention_status ? DETENTION_BADGE[stop.detention_status] : null;
  const isPickup = stop.stop_type === "pickup";

  return (
    <div
      className={`relative rounded border p-3 text-sm ${stop.is_layover ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"}`}
    >
      {stop.is_layover && (
        <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
          Layover — dwell &gt; 8 hours
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-800">
            #{stop.sequence} · {isPickup ? "Pickup" : "Delivery"}
          </div>
          <div className="text-xs text-gray-500">
            {stop.city ?? "—"}, {stop.state ?? "—"}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${src.className}`}>{src.label}</span>
          {det && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${det.className}`}>{det.label}</span>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        <div>
          <span className="font-medium">Arrived:</span> {formatTs(stop.arrived_at)}
        </div>
        <div>
          <span className="font-medium">Departed:</span> {formatTs(stop.departed_at)}
        </div>
        {stop.scheduled_arrival_at ? (
          <div className="col-span-2">
            <span className="font-medium">Scheduled:</span> {formatTs(stop.scheduled_arrival_at)}
          </div>
        ) : null}
      </div>

      <div className="mt-2">
        <DwellBar dwellMinutes={stop.dwell_minutes} freeTimeMinutes={stop.free_time_minutes} />
        <div className="mt-1 flex gap-4 text-xs text-gray-500">
          <span>
            Dwell: <span className="font-semibold text-gray-800">{formatDuration(stop.dwell_minutes)}</span>
          </span>
          <span>
            Free time:{" "}
            <span className="font-semibold text-gray-700">{formatDuration(stop.free_time_minutes)}</span>
          </span>
          {stop.detention_minutes > 0 && (
            <span>
              Detention:{" "}
              <span className="font-semibold text-red-700">{formatDuration(stop.detention_minutes)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LoadDetailGeofenceTimelineTab({ loadId, operatingCompanyId }: Props) {
  const query = useQuery({
    queryKey: ["load-geofence-timeline", loadId, operatingCompanyId],
    queryFn: () =>
      apiRequest<TimelineResponse>(
        `/api/v1/dispatch/loads/${encodeURIComponent(loadId)}/geofence-timeline?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  if (query.isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading geofence timeline…</div>;
  }

  if (query.error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load geofence timeline.
      </div>
    );
  }

  const stops: GeofenceStop[] = query.data?.stops ?? [];

  if (stops.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        No pickup or delivery stops found.
        <div className="mt-1 text-xs text-gray-400">
          Timeline data populates as the driver arrives at and departs each stop.
        </div>
      </div>
    );
  }

  const hasAnyDwell = stops.some((s) => s.dwell_minutes !== null);

  return (
    <div className="space-y-3">
      {!hasAnyDwell && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
          No arrival/departure timestamps yet — timeline will populate as the load progresses.
        </div>
      )}

      <div className="flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-8 rounded-full bg-emerald-400" /> Within free time
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-8 rounded-full bg-red-400" /> Over free time
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-0.5 bg-gray-500 opacity-70" /> Threshold line
        </span>
      </div>

      {stops.map((stop) => (
        <StopCard key={stop.stop_id} stop={stop} />
      ))}
    </div>
  );
}
