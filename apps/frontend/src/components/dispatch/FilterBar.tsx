import { Combobox } from "../Combobox";
import { EntityPicker } from "../parity/EntityPicker";
import { DatePicker } from "../../components/forms/DatePicker";
import { CollapsedListFilters, TableSearch, ColumnChooser, type TableColumn } from "../../components/table";
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
  /** Entity-scoped company for EntityPicker filters (driver/customer). */
  operatingCompanyId: string;
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
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
];

export function FilterBar({
  value,
  onChange,
  companies,
  customers,
  drivers,
  operatingCompanyId,
  onClearAll,
  columns,
  hiddenColumns,
  onToggleColumn,
  pageSize,
  onPageSizeChange,
}: Props) {
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

  return (
    // CHROME-02: this IS the original slim QuickBooks-style toolbar the shared
    // CollapsedListFilters gold pattern was extracted from — now delegates to that shared
    // component too, so there is exactly one popover/collapse implementation, not two.
    <div className="flex flex-wrap items-center gap-2" data-dispatch-toolbar="true">
      <CollapsedListFilters
        activeFilterCount={activeCount}
        testIdPrefix="dispatch"
        searchSlot={
          <TableSearch
            value={value.search}
            onChange={(search) => onChange({ ...value, search })}
            placeholder="Load #, customer, stop city…"
            className="w-64"
          />
        }
      >
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
          <div className="space-y-1" data-testid="dispatch-filter-driver">
            <label className="text-xs font-semibold text-gray-600">Driver</label>
            {/* SAF-B29: EntityPicker kind=driver — never Combobox over parent listDrivers page. */}
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={value.driverId}
              onChange={(driverId) => onChange({ ...value, driverId })}
              placeholder="Search driver"
              allowClear
              allowCreate={false}
              dataTestId="dispatch-filter-driver-picker"
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
          <span className="rounded-sm bg-gray-100 px-2 py-1 text-gray-700">Active filters: {activeCount}</span>
          {value.companyIds.map((id) => {
            const company = companies.find((item) => item.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ ...value, companyIds: value.companyIds.filter((companyId) => companyId !== id) })}
                className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50"
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
              className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              Status: {STATUS_LABEL[status]} ×
            </button>
          ))}
          {customerOption ? (
            <button type="button" onClick={() => onChange({ ...value, customerId: null })} className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Customer: {customerOption.label} ×
            </button>
          ) : null}
          {driverOption ? (
            <button type="button" onClick={() => onChange({ ...value, driverId: null })} className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Driver: {driverOption.label} ×
            </button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={onClearAll}>
            Clear All Filters
          </Button>
        </div>
      </CollapsedListFilters>
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
  );
}
