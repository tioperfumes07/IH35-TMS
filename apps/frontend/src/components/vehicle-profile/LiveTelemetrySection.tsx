export function LiveTelemetrySection({
  samsara,
  latestPosition,
}: {
  samsara: Record<string, unknown> | null;
  latestPosition: Record<string, unknown> | null;
}) {
  const parsed = (samsara?.raw_payload_parsed as Record<string, unknown>) ?? {};
  const faults = (parsed.fault_codes as Array<{ code: string; severity: string; description: string | null }>) ?? [];
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Live telemetry (Samsara)</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div>GPS: {latestPosition ? `${latestPosition.lat}, ${latestPosition.lng}` : "—"}</div>
        <div>Speed: {String(latestPosition?.speed_mph ?? "—")} mph</div>
        <div>Heading: {String(latestPosition?.heading_deg ?? "—")}°</div>
        <div>Engine: {String(latestPosition?.engine_state ?? "—")}</div>
        <div>Odometer: {String(parsed.odometer_miles ?? "—")} mi</div>
        <div>Engine hrs: {String(parsed.engine_hours ?? "—")}</div>
        <div>Fuel: {parsed.fuel_level_pct != null ? `${parsed.fuel_level_pct}%` : "—"}</div>
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
