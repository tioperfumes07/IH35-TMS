import { useMemo } from "react";
import { DatePicker } from "../../../components/forms/DatePicker";
import type { RunnerFilter } from "./runner-config";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";

type Props = {
  filters: RunnerFilter[];
  values: Record<string, unknown>;
  onChange: (key: string, val: unknown) => void;
  /** Called with the currently-displayed (draft) filter values -- see REPORTS-RUNNER-DATEPICKER-SILENT-DISCARD. */
  onRun: (effectiveValues: Record<string, unknown>) => void;
  isRunning: boolean;
};

// LV-REPORT-RUNNER-REQUIRED-FILTER-NO-INDICATOR-2026-08-23 — every filter type below renders its
// label via this helper. requiredMissing() already disables "Run report" until a required filter
// (e.g. driver_select on Driver pay history) is filled, but the label itself never told the operator
// WHY the button stayed disabled — confirmed live: selecting nothing left "Run report" silently
// disabled with zero visual cue. Centralizing the label render so every filter type (date_range,
// month_picker, unit_select, driver_select, company fallback) gets the same required marker.
function FilterLabel({ filter }: { filter: RunnerFilter }) {
  return (
    <div className="mb-1 text-xs font-semibold text-slate-600">
      {filter.label}
      {filter.required ? (
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      ) : null}
    </div>
  );
}

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
  const staged = useStagedListFilters({
    applied: values,
    empty: defaultFilterValues(filters),
    onApply: (next) => {
      for (const key of new Set([...Object.keys(values), ...Object.keys(next)])) onChange(key, next[key] ?? "");
    },
  });
  const draft = staged.draft;

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

  // LV-REPORT-RUNNER-EMPTY-FILTERS-THEATER — fieldless configs must not mount empty Filters chrome.
  if (filters.length === 0) {
    return (
      <section className="space-y-2" data-runner-filter-toolbar="none" data-testid="runner-no-filters">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onRun(values)}
            disabled={isRunning}
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Running..." : "Run report"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2" data-runner-filter-toolbar="collapsed">
      <CollapsedListFilters activeFilterCount={activeFilterCount} testIdPrefix="runner" onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filters.map((filter) => {
            if (filter.type === "date_range") {
              return (
                <div key={filter.key} className="md:col-span-2 xl:col-span-2">
                  <FilterLabel filter={filter} />
                  <div className="flex items-center gap-2">
                    <DatePicker className="" value={String(draft.from ?? "")} onChange={(next) => staged.setDraft({ ...draft, from: next })} />
                    <span className="text-slate-500">to</span>
                    <DatePicker className="" value={String(draft.to ?? "")} onChange={(next) => staged.setDraft({ ...draft, to: next })} />
                  </div>
                </div>
              );
            }
            if (filter.type === "month_picker") {
              return (
                <label key={filter.key} className="block">
                  <FilterLabel filter={filter} />
                  <input type="month" className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(draft[filter.key] ?? "")} onChange={(e) => staged.setDraft({ ...draft, [filter.key]: e.target.value })} />
                </label>
              );
            }
            if (filter.type === "unit_select") {
              return (
                <label key={filter.key} className="block" data-testid={`runner-filter-unit-${filter.key}`}>
                  <FilterLabel filter={filter} />
                  <EntityPicker
                    kind="unit"
                    operatingCompanyId={selectedCompanyId ?? ""}
                    value={String(draft[filter.key] ?? "") || null}
                    onChange={(next) => staged.setDraft({ ...draft, [filter.key]: next ?? "" })}
                    enabled={Boolean(selectedCompanyId)}
                    placeholder="Select unit"
                    className="h-9 w-full text-sm"
                    dataField={`runner-filter-${filter.key}`}
                    allowClear
                    allowCreate={false}
                  />
                </label>
              );
            }
            if (filter.type === "driver_select") {
              return (
                <label key={filter.key} className="block" data-testid={`runner-filter-driver-${filter.key}`}>
                  <FilterLabel filter={filter} />
                  <EntityPicker
                    kind="driver"
                    operatingCompanyId={selectedCompanyId ?? ""}
                    value={String(draft[filter.key] ?? "") || null}
                    onChange={(next) => staged.setDraft({ ...draft, [filter.key]: next ?? "" })}
                    enabled={Boolean(selectedCompanyId)}
                    placeholder="Search driver…"
                    className="h-9 w-full text-sm"
                    dataField={`runner-filter-${filter.key}`}
                    allowClear
                    allowCreate={false}
                  />
                </label>
              );
            }
            const showCompany = companies.length > 1;
            if (!showCompany) return null;
            return (
              <label key={filter.key} className="block">
                <FilterLabel filter={filter} />
                <SelectCombobox className="w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" value={String(draft[filter.key] ?? selectedCompanyId ?? "")} onChange={(e) => staged.setDraft({ ...draft, [filter.key]: e.target.value })}>
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
          data-collapsed-filters-safe
          onClick={() => {
            // REPORTS-RUNNER-DATEPICKER-SILENT-DISCARD: `draft` is always the value the
            // operator currently sees in the date fields (kept in sync with `values` while
            // not dirty). Commit it before running so "Run report" always reflects what is
            // on screen, whether or not the operator separately clicked "Apply" first.
            if (staged.dirty) staged.apply();
            onRun(draft);
          }}
          disabled={requiredMissing || isRunning}
          className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running..." : "Run report"}
        </button>
      </div>
    </section>
  );
}
