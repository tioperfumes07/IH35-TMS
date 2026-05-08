import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RunnerFilter } from "./runner-config";
import { listDrivers, listUnits } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type Props = {
  filters: RunnerFilter[];
  values: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  onRun: () => void;
  isRunning: boolean;
};

function todayMinus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function defaultFilterValues(filters: RunnerFilter[]) {
  const fromDefault = todayMinus(30);
  const toDefault = new Date().toISOString().slice(0, 10);
  const result: Record<string, unknown> = { from: fromDefault, to: toDefault };
  for (const filter of filters) {
    if (filter.type === "month_picker" && filter.default) result[filter.key] = filter.default;
  }
  return result;
}

export function RunnerFilters({ filters, values, onChange, onRun, isRunning }: Props) {
  const { selectedCompanyId, companies } = useCompanyContext();
  const driversQuery = useQuery({
    queryKey: ["runner-filters", "drivers", selectedCompanyId ?? ""],
    queryFn: () => listDrivers({ status: "Active", search: "", operating_company_id: selectedCompanyId ?? undefined }),
    enabled: filters.some((f) => f.type === "driver_select"),
  });
  const unitsQuery = useQuery({
    queryKey: ["runner-filters", "units", selectedCompanyId ?? ""],
    queryFn: () => listUnits({ status: "active", operating_company_id: selectedCompanyId }),
    enabled: filters.some((f) => f.type === "unit_select"),
  });

  const requiredMissing = useMemo(() => {
    return filters.some((filter) => {
      if (!filter.required) return false;
      if (filter.type === "date_range") return !values.from || !values.to;
      const v = values[filter.key];
      return v == null || String(v) === "";
    });
  }, [filters, values]);

  return (
    <section className="rounded border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filters.map((filter) => {
          if (filter.type === "date_range") {
            return (
              <div key={filter.key} className="md:col-span-2 xl:col-span-2">
                <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                <div className="flex items-center gap-2">
                  <input type="date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values.from ?? "")} onChange={(e) => onChange("from", e.target.value)} />
                  <span className="text-slate-500">to</span>
                  <input type="date" className="rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values.to ?? "")} onChange={(e) => onChange("to", e.target.value)} />
                </div>
              </div>
            );
          }
          if (filter.type === "month_picker") {
            return (
              <label key={filter.key} className="block">
                <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                <input type="month" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? "")} onChange={(e) => onChange(filter.key, e.target.value)} />
              </label>
            );
          }
          if (filter.type === "unit_select") {
            const units = (unitsQuery.data?.units ?? []) as Array<{ id: string; unit_number: string }>;
            return (
              <label key={filter.key} className="block">
                <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                <select className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? "")} onChange={(e) => onChange(filter.key, e.target.value)}>
                  <option value="">All units</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_number}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (filter.type === "driver_select") {
            const drivers = driversQuery.data?.drivers ?? [];
            return (
              <label key={filter.key} className="block">
                <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                <select className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? "")} onChange={(e) => onChange(filter.key, e.target.value)}>
                  <option value="">Select driver</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {`${driver.first_name} ${driver.last_name}`}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          const showCompany = companies.length > 1;
          if (!showCompany) return null;
          return (
            <label key={filter.key} className="block">
              <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
              <select className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? selectedCompanyId ?? "")} onChange={(e) => onChange(filter.key, e.target.value)}>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.legal_name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRun}
          disabled={requiredMissing || isRunning}
          className="rounded border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run report"}
        </button>
      </div>
    </section>
  );
}
