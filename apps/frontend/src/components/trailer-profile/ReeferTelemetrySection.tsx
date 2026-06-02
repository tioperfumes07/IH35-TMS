export function ReeferTelemetrySection({
  reefer,
  telemetry,
}: {
  reefer: Record<string, unknown> | null;
  telemetry: Record<string, unknown> | null;
}) {
  if (!reefer) return null;
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Reefer telemetry</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>Setpoint °F: {String(reefer.reefer_setpoint_temp_f ?? "—")}</div>
        <div>Brand: {String(reefer.reefer_brand ?? "—")}</div>
        <div>Service interval (hrs): {String(reefer.reefer_service_interval_hours ?? "—")}</div>
        <div>Last service hrs: {String(reefer.reefer_last_service_hours ?? "—")}</div>
      </div>
      {telemetry ? <p className="mt-2 text-xs text-gray-500">Samsara feed linked via power unit.</p> : null}
    </section>
  );
}
