type ReeferData = {
  equipment_number?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  setpoint_temp_f?: number | string | null;
  fuel_capacity_gal?: number | string | null;
  current_hours_from_samsara?: number | null;
  hours_until_service?: number | null;
  last_service_date?: string | null;
  cargo_temp_f_current?: number | null;
};

export function ReeferSection({ reefer }: { reefer: ReeferData }) {
  const hours = reefer.current_hours_from_samsara;
  const until = reefer.hours_until_service;
  const pct =
    hours != null && until != null && reefer.hours_until_service != null
      ? Math.min(100, Math.round((hours / (hours + until)) * 100))
      : null;

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Reefer · {reefer.equipment_number ?? "Trailer"}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Brand / model" value={[reefer.brand, reefer.model, reefer.year].filter(Boolean).join(" ") || "—"} />
        <Card label="Setpoint °F" value={reefer.setpoint_temp_f != null ? String(reefer.setpoint_temp_f) : "—"} />
        <Card label="Actual cargo °F" value={reefer.cargo_temp_f_current != null ? String(reefer.cargo_temp_f_current) : "—"} />
        <Card label="Reefer fuel (gal)" value={reefer.fuel_capacity_gal != null ? String(reefer.fuel_capacity_gal) : "—"} />
      </div>
      {pct != null ? (
        <div className="mt-3">
          <div className="text-xs text-gray-600">Hours until service</div>
          <div className="mt-1 h-2 rounded bg-gray-100">
            <div className="h-2 rounded bg-[#1F2A44]" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-gray-500">{until} hrs remaining · last service {reefer.last_service_date ?? "—"}</div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-gray-500">Read-only — edit trailer reefer fields in equipment module.</p>
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-100 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{value}</div>
    </div>
  );
}
