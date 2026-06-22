import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Combobox } from "../Combobox";
import { DatePicker } from "../../components/forms/DatePicker";
import { TableSearch, ColumnChooser, type TableColumn } from "../../components/table";
import { Button } from "../Button";
import type { LoadStatus } from "../../api/loads";
import { STATUS_LABEL } from "./constants";

export type DispatchFilterState = {
  companyIds: string[];
  statuses: LoadStatus[];
  customerId: string | null;
  driverId: string | null;
  dateMode: "pickup" | "delivery";
  dateFrom: string;
  dateTo: string;
  search: string;
};

type LookupOption = {
  id: string;
  label: string;
  sublabel?: string;
};

type CompanyOption = {
  id: string;
  label: string;
  shortName?: string | null;
};

type Props = {
  value: DispatchFilterState;
  onChange: (next: DispatchFilterState) => void;
  companies: CompanyOption[];
  customers: LookupOption[];
  drivers: LookupOption[];
  onClearAll: () => void;
  // GLOBAL-TABLE-CONTROLS gear (column chooser + rows-per-page). Optional so the board can
  // wire it once its columns adopt the shared controller (Part B). Reused, never re-forked.
  columns?: TableColumn[];
  hiddenColumns?: Set<string>;
  onToggleColumn?: (key: string) => void;
  pageSize?: number;
  onPageSizeChange?: (n: number) => void;
};

const ALL_LOAD_STATUSES: LoadStatus[] = [
  "draft",
  "booked",
  "planned",
  "assigned",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
];

export function FilterBar({
  value,
  onChange,
  companies,
  customers,
  drivers,
  onClearAll,
  columns,
  hiddenColumns,
  onToggleColumn,
  pageSize,
  onPageSizeChange,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Active filters EXCLUDE the search box (which lives inline in the slim toolbar).
  const activeCount =
    value.companyIds.length +
    value.statuses.length +
    (value.customerId ? 1 : 0) +
    (value.driverId ? 1 : 0) +
    (value.dateFrom ? 1 : 0) +
    (value.dateTo ? 1 : 0);

  const customerOption = customers.find((item) => item.id === value.customerId) ?? null;
  const driverOption = drivers.find((item) => item.id === value.driverId) ?? null;

  useEffect(() => {
    if (!filtersOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filtersOpen]);

  return (
    <div className="relative" ref={ref} data-dispatch-toolbar="true">
      {/* Slim QuickBooks-style toolbar: search + Filters + gear (replaces the old 196px block). */}
      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={value.search}
          onChange={(search) => onChange({ ...value, search })}
          placeholder="Load #, customer, stop city…"
          className="w-64"
        />
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex h-8 items-center gap-1 rounded border border-gray-300 bg-white px-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-[#1F2A44] px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
        {columns && hiddenColumns && onToggleColumn && pageSize != null && onPageSizeChange ? (
          <div className="ml-auto">
            <ColumnChooser
              columns={columns}
              hidden={hiddenColumns}
              onToggleColumn={onToggleColumn}
              pageSize={pageSize}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        ) : null}
      </div>

      {/* Filters popover — every prior filter lives here; nothing removed, just collapsed. */}
      {filtersOpen ? (
        <div className="absolute left-0 z-30 mt-1 w-[min(680px,90vw)] space-y-2 rounded border border-gray-200 bg-white p-3 shadow-lg">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Operating Company</label>
              <Combobox
                options={companies.map((company) => ({ value: company.id, label: company.label, sublabel: company.shortName ?? undefined }))}
                value={value.companyIds[0] ?? null}
                onChange={(nextCompanyId) => onChange({ ...value, companyIds: nextCompanyId ? [nextCompanyId] : [] })}
                placeholder="Select company"
                allowClear
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Status</label>
              <Combobox
                options={ALL_LOAD_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
                value={value.statuses[0] ?? null}
                onChange={(nextStatus) => {
                  if (!nextStatus) {
                    onChange({ ...value, statuses: [] });
                    return;
                  }
                  const statusValue = nextStatus as LoadStatus;
                  const exists = value.statuses.includes(statusValue);
                  const statuses = exists ? value.statuses.filter((status) => status !== statusValue) : [...value.statuses, statusValue];
                  onChange({ ...value, statuses });
                }}
                placeholder="Select status (multi)"
                allowClear
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Customer</label>
              <Combobox
                options={customers.map((item) => ({ value: item.id, label: item.label, sublabel: item.sublabel }))}
                value={value.customerId}
                onChange={(customerId) => onChange({ ...value, customerId })}
                placeholder="Search customer"
                allowClear
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Driver</label>
              <Combobox
                options={drivers.map((item) => ({ value: item.id, label: item.label, sublabel: item.sublabel }))}
                value={value.driverId}
                onChange={(driverId) => onChange({ ...value, driverId })}
                placeholder="Search driver"
                allowClear
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Date Mode</label>
              <div className="flex gap-1">
                {(["pickup", "delivery"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={value.dateMode === mode ? "primary" : "secondary"}
                    onClick={() => onChange({ ...value, dateMode: mode })}
                  >
                    {mode === "pickup" ? "Pickup" : "Delivery"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Date From</label>
              {/* DatePicker renders its own bordered control — no extra border here (was box-in-box). */}
              <DatePicker value={value.dateFrom} onChange={(next) => onChange({ ...value, dateFrom: next })} className="w-full" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-600">Date To</label>
              <DatePicker value={value.dateTo} onChange={(next) => onChange({ ...value, dateTo: next })} className="w-full" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 text-xs">
            <span className="rounded bg-gray-100 px-2 py-1 text-gray-700">Active filters: {activeCount}</span>
            {value.companyIds.map((id) => {
              const company = companies.find((item) => item.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ ...value, companyIds: value.companyIds.filter((companyId) => companyId !== id) })}
                  className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
                >
                  Company: {company?.label ?? id} ×
                </button>
              );
            })}
            {value.statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onChange({ ...value, statuses: value.statuses.filter((item) => item !== status) })}
                className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
              >
                Status: {STATUS_LABEL[status]} ×
              </button>
            ))}
            {customerOption ? (
              <button type="button" onClick={() => onChange({ ...value, customerId: null })} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
                Customer: {customerOption.label} ×
              </button>
            ) : null}
            {driverOption ? (
              <button type="button" onClick={() => onChange({ ...value, driverId: null })} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50">
                Driver: {driverOption.label} ×
              </button>
            ) : null}
            <Button type="button" size="sm" variant="secondary" onClick={onClearAll}>
              Clear All Filters
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
