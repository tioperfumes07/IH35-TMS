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
  const toNullableNumber = (input: unknown) => {
    if (input == null || input === "") return null;
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const availableBasics = BASICS.filter((basic) => basic.key !== "basic_hazmat")
    .map((basic) => toNullableNumber(value[basic.key]))
    .filter((score): score is number => score != null);
  const maxBasic = availableBasics.length > 0 ? Math.max(...availableBasics) : null;
  const totalPoints = toNullableNumber(value.total_points);
  const totalInspections = toNullableNumber(value.total_inspections);
  const totalOos = toNullableNumber(value.total_oos);
  return (
    <section className="rounded-sm border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-page-title font-semibold text-slate-900">{totalPoints == null ? "—" : totalPoints.toLocaleString()}</div>
          <div className="text-xs text-slate-600">Internal inspection points</div>
        </div>
        <span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
          Not an FMCSA percentile
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-sm border border-slate-200 p-2">
          <div className="text-slate-500">Inspections</div>
          <div className="font-semibold text-slate-900">{totalInspections == null ? "—" : totalInspections.toLocaleString()}</div>
        </div>
        <div className="rounded-sm border border-slate-200 p-2">
          <div className="text-slate-500">Out of Service</div>
          <div className="font-semibold text-slate-900">{totalOos == null ? "—" : totalOos.toLocaleString()}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {BASICS.map((basic) => {
          const score = basic.key === "basic_hazmat" ? null : toNullableNumber(value[basic.key]);
          const width = score != null && maxBasic != null && maxBasic > 0 ? `${Math.round((score / maxBasic) * 100)}%` : "0%";
          return (
            <div key={basic.key}>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                <span>{basic.label}</span>
                <span>
                  {basic.key === "basic_hazmat"
                    ? "Authenticated carrier SMS required"
                    : score == null
                      ? "Unavailable"
                      : score.toFixed(1)}
                </span>
              </div>
              <div className="h-2 rounded-sm bg-slate-100">
                <div
                  className="h-2 rounded-sm bg-[#1f2a44]"
                  data-testid={`csa-bar-${basic.key}`}
                  style={{ width }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-xs text-slate-500">Last computed: {value.computed_at ? new Date(String(value.computed_at)).toLocaleString() : "—"}</div>
    </section>
  );
}
