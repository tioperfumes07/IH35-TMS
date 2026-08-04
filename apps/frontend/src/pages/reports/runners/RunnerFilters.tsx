import { useMemo, useState } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useQuery } from "@tanstack/react-query";
import type { RunnerFilter } from "./runner-config";
import { listDrivers, listUnits } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Combobox, type ComboboxOption } from "../../../components/Combobox";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters } from "../../../components/table";

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
  // SAF-B29 / CLS-SILENT-CAP: never listDrivers(search:"", limit:200) — type-ahead re-queries past page 1.
  const [driverSearch, setDriverSearch] = useState("");
  const driversQuery = useQuery({
    queryKey: ["runner-filters", "drivers", selectedCompanyId ?? "", driverSearch],
    queryFn: () =>
      listDrivers({
        status: "Active",
        search: driverSearch || undefined,
        operating_company_id: selectedCompanyId ?? null,
        limit: 200,
      }),
    enabled: filters.some((f) => f.type === "driver_select") && Boolean(selectedCompanyId),
  });
  const driverOptions = useMemo<ComboboxOption[]>(() => {
    return (driversQuery.data?.drivers ?? []).map((driver) => ({
      value: driver.id,
      label: `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id,
    }));
  }, [driversQuery.data?.drivers]);
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

  const activeFilterCount = filters.reduce((count, filter) => {
    if (filter.type === "date_range") return count + (values.from || values.to ? 1 : 0);
    const v = values[filter.key];
    return count + (v != null && String(v) !== "" ? 1 : 0);
  }, 0);

  return (
    <section className="space-y-2" data-runner-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={activeFilterCount} testIdPrefix="runner">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filters.map((filter) => {
            if (filter.type === "date_range") {
              return (
                <div key={filter.key} className="md:col-span-2 xl:col-span-2">
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <div className="flex items-center gap-2">
                    <DatePicker className="rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(values.from ?? "")} onChange={(next) => onChange("from", next)} />
                    <span className="text-slate-500">to</span>
                    <DatePicker className="rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(values.to ?? "")} onChange={(next) => onChange("to", next)} />
                  </div>
                </div>
              );
            }
            if (filter.type === "month_picker") {
              return (
                <label key={filter.key} className="block">
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <input type="month" className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? "")} onChange={(e) => onChange(filter.key, e.target.value)} />
                </label>
              );
            }
            if (filter.type === "unit_select") {
              const units = (unitsQuery.data?.units ?? []) as Array<{ id: string; unit_number: string }>;
              return (
                <label key={filter.key} className="block">
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <SelectCombobox className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? "")} onChange={(e) => onChange(filter.key, e.target.value)}>
                    <option value="">Select unit</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number}
                      </option>
                    ))}
                  </SelectCombobox>
                </label>
              );
            }
            if (filter.type === "driver_select") {
              const selectedDriverId = String(values[filter.key] ?? "");
              return (
                <label key={filter.key} className="block">
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <Combobox
                    options={driverOptions}
                    value={selectedDriverId || null}
                    onChange={(next) => onChange(filter.key, next ?? "")}
                    onSearch={setDriverSearch}
                    placeholder={driversQuery.isLoading ? "Loading drivers…" : "Search driver…"}
                    loading={driversQuery.isLoading}
                    allowClear
                    filterMode="contains"
                    className="h-9 w-full rounded-sm border border-slate-300 text-sm focus:border-[#1f2a44] focus:ring-1 focus:ring-[#1f2a44]"
                    dataField={`runner-filter-${filter.key}`}
                  />
                </label>
              );
            }
            const showCompany = companies.length > 1;
            if (!showCompany) return null;
            return (
              <label key={filter.key} className="block">
                <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                <SelectCombobox className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(values[filter.key] ?? selectedCompanyId ?? "")} onChange={(e) => onChange(filter.key, e.target.value)}>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.legal_name}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
            );
          })}
        </div>
      </CollapsedListFilters>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRun}
          disabled={requiredMissing || isRunning}
          className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run report"}
        </button>
      </div>
    </section>
  );
}
