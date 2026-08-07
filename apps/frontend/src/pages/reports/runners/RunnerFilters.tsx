import { useMemo } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import type { RunnerFilter } from "./runner-config";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EntityPicker } from "../../../components/parity/EntityPicker";
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
              return (
                <label key={filter.key} className="block" data-testid={`runner-filter-unit-${filter.key}`}>
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <EntityPicker
                    kind="unit"
                    operatingCompanyId={selectedCompanyId ?? ""}
                    value={String(values[filter.key] ?? "") || null}
                    onChange={(next) => onChange(filter.key, next ?? "")}
                    enabled={Boolean(selectedCompanyId)}
                    placeholder="Select unit"
                    className="h-9 w-full text-sm"
                    dataField={`runner-filter-${filter.key}`}
                    allowClear
                  />
                </label>
              );
            }
            if (filter.type === "driver_select") {
              return (
                <label key={filter.key} className="block" data-testid={`runner-filter-driver-${filter.key}`}>
                  <div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>
                  <EntityPicker
                    kind="driver"
                    operatingCompanyId={selectedCompanyId ?? ""}
                    value={String(values[filter.key] ?? "") || null}
                    onChange={(next) => onChange(filter.key, next ?? "")}
                    enabled={Boolean(selectedCompanyId)}
                    placeholder="Search driver…"
                    className="h-9 w-full text-sm"
                    dataField={`runner-filter-${filter.key}`}
                    allowClear
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
