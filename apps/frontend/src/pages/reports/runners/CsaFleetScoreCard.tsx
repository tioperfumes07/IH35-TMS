type Props = {
  value: Record<string, unknown>;
};

import { useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { mmmDdTime } from "../../../lib/formatDate";

const BASICS: Array<{ key: string; label: string; sortable?: boolean }> = [
  { key: "basic_unsafe_driving", label: "Unsafe Driving", sortable: true },
  { key: "basic_hos_compliance", label: "HOS Compliance", sortable: true },
  { key: "basic_drug_alcohol", label: "Drug/Alcohol", sortable: true },
  { key: "basic_vehicle_maintenance", label: "Vehicle Maintenance", sortable: true },
  { key: "basic_hazmat", label: "Hazmat", sortable: true },
  { key: "basic_crash_indicator", label: "Crash Indicator", sortable: true },
  { key: "basic_driver_fitness", label: "Driver Fitness", sortable: true },
];

export function CsaFleetScoreCard({ value }: Props) {
  // K.9 inline filter pattern — direct useState, no staging. Visible on first load (0 clicks).
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
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
    <section className="space-y-3">
      {/* K.9 inline filter bar — visible on first load, 0 clicks */}
      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-slate-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          From
          <DatePicker className="mt-1 block h-9" value={filterFrom} onChange={setFilterFrom} />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker className="mt-1 block h-9" value={filterTo} onChange={setFilterTo} />
        </label>
        <label className="text-xs text-gray-600">
          Unit
          <input
            type="text"
            className="mt-1 block h-9 w-32 rounded-sm border border-gray-300 px-2 text-xs"
            value={filterUnit}
            onChange={(e) => setFilterUnit(e.target.value)}
            placeholder="All units"
            data-testid="csa-fleet-scorecard-unit-filter"
            // TODO: wire to backend filter
          />
        </label>
      </div>
      <section className="rounded-sm border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-page-title font-semibold text-slate-900">{totalPoints == null ? "—" : totalPoints.toLocaleString()}</div>
          <div className="text-xs text-slate-600">Internal inspection points</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
            Not an FMCSA percentile
          </span>
          <button
            type="button"
            onClick={() => {
              const headers = ["metric", "value"];
              const lines = [headers.join(",")];
              for (const basic of BASICS) {
                const score = basic.key === "basic_hazmat" ? null : toNullableNumber(value[basic.key]);
                lines.push([basic.label, score == null ? "" : String(score)].join(","));
              }
              lines.push(["total_points", totalPoints == null ? "" : String(totalPoints)].join(","));
              lines.push(["total_inspections", totalInspections == null ? "" : String(totalInspections)].join(","));
              lines.push(["total_oos", totalOos == null ? "" : String(totalOos)].join(","));
              lines.push(["computed_at", value.computed_at ?? ""].join(","));
              const blob = new Blob([lines.join("\n")], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "csa-fleet-scorecard.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Print
          </button>
        </div>
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
      <div className="mt-3 text-xs text-slate-500">Last computed: {value.computed_at ? mmmDdTime(value.computed_at as string) : "—"}</div>
    </section>
    </section>
  );
}
