type Props = {
  value: Record<string, unknown>;
};

const BASICS: Array<{ key: string; label: string }> = [
  { key: "basic_unsafe_driving", label: "Unsafe Driving" },
  { key: "basic_hos_compliance", label: "HOS Compliance" },
  { key: "basic_drug_alcohol", label: "Drug/Alcohol" },
  { key: "basic_vehicle_maintenance", label: "Vehicle Maintenance" },
  { key: "basic_hazmat", label: "Hazmat" },
  { key: "basic_crash_indicator", label: "Crash Indicator" },
  { key: "basic_driver_fitness", label: "Driver Fitness" },
];

export function CsaFleetScoreCard({ value }: Props) {
  const thresholdStatus = String(value.threshold_status ?? "green");
  const pillClass =
    thresholdStatus === "red"
      ? "bg-red-100 text-red-700 border-red-300"
      : thresholdStatus === "yellow"
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : "bg-emerald-100 text-emerald-700 border-emerald-300";
  const maxBasic = Math.max(1, ...BASICS.map((b) => Number(value[b.key] ?? 0)));
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-3xl font-semibold text-slate-900">{Number(value.total_points ?? 0).toLocaleString()}</div>
          <div className="text-xs text-slate-600">Total CSA points (rolling 24mo)</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold uppercase ${pillClass}`}>{thresholdStatus}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded border border-slate-200 p-2">
          <div className="text-slate-500">Inspections</div>
          <div className="font-semibold text-slate-900">{Number(value.total_inspections ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded border border-slate-200 p-2">
          <div className="text-slate-500">Out of Service</div>
          <div className="font-semibold text-slate-900">{Number(value.total_oos ?? 0).toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {BASICS.map((basic) => {
          const score = Number(value[basic.key] ?? 0);
          const width = `${Math.max(4, Math.round((score / maxBasic) * 100))}%`;
          return (
            <div key={basic.key}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                <span>{basic.label}</span>
                <span>{score.toFixed(1)}</span>
              </div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-[#1f2a44]" style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500">Last computed: {value.computed_at ? new Date(String(value.computed_at)).toLocaleString() : "—"}</div>
    </section>
  );
}
