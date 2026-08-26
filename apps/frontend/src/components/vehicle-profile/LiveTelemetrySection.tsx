import { formatDateUS } from "../../lib/formatDate";

const LIVE_MS = 5 * 60 * 1000;

function formatInstant(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${formatDateUS(iso)} ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d)}`;
}

function dash(value: unknown, suffix = ""): string {
  if (value == null || value === "") return "—";
  return `${String(value)}${suffix}`;
}

export function LiveTelemetrySection({
  samsara,
  latestPosition,
}: {
  samsara: Record<string, unknown> | null;
  latestPosition: Record<string, unknown> | null;
}) {
  const parsed = (samsara?.raw_payload_parsed as Record<string, unknown>) ?? {};
  const faults = (parsed.fault_codes as Array<{ code: string; severity: string; description: string | null }>) ?? [];
  const capturedAt = latestPosition?.captured_at != null ? String(latestPosition.captured_at) : samsara?.last_seen_at != null ? String(samsara.last_seen_at) : null;
  const capturedMs = capturedAt ? new Date(capturedAt).getTime() : NaN;
  const isLive = Number.isFinite(capturedMs) && Date.now() - capturedMs <= LIVE_MS;
  const readingLabel = formatInstant(capturedAt);
  const odometer =
    parsed.odometer_miles ??
    latestPosition?.odometer_mi ??
    latestPosition?.book_odometer_mi ??
    null;
  const hasGps = latestPosition?.lat != null && latestPosition?.lng != null;

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="vp-live-telemetry">
      <h3 className="text-sm font-semibold text-gray-800">Live telemetry (Samsara)</h3>
      <p className="mt-1 text-xs text-gray-600" data-testid="vp-telemetry-freshness">
        {hasGps
          ? isLive
            ? `Live GPS as of ${readingLabel}`
            : `Last GPS reading ${readingLabel ?? "—"} (not in the last 5 minutes)`
          : "No GPS ping on file for this unit"}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div>GPS: {hasGps ? `${latestPosition?.lat}, ${latestPosition?.lng}` : "—"}</div>
        <div>Speed: {dash(latestPosition?.speed_mph, " mph")}</div>
        <div>Heading: {latestPosition?.heading_deg != null ? `${latestPosition.heading_deg}°` : "—"}</div>
        <div>Engine: {dash(latestPosition?.engine_state)}</div>
        <div data-testid="vp-telemetry-odometer">Odometer: {odometer != null ? `${odometer} mi` : "— not in last poll"}</div>
        <div data-testid="vp-telemetry-engine-hours">Engine hrs: {parsed.engine_hours != null ? String(parsed.engine_hours) : "— not in last poll"}</div>
        <div data-testid="vp-telemetry-fuel">Fuel: {parsed.fuel_level_pct != null ? `${parsed.fuel_level_pct}%` : "— not in last poll"}</div>
        <div>Source: {dash(latestPosition?.source ?? (samsara ? "samsara" : null))}</div>
      </div>
      {faults.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-xs text-gray-700">
          {faults.slice(0, 3).map((f) => (
            <li key={f.code}>
              {f.code} ({f.severity}) {f.description ?? ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-500">No active fault codes.</p>
      )}
    </section>
  );
}
