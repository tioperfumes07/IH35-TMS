import { Combobox } from "../Combobox";
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

export function FilterBar({ value, onChange, companies, customers, drivers, onClearAll }: Props) {
  const activeCount =
    value.companyIds.length +
    value.statuses.length +
    (value.customerId ? 1 : 0) +
    (value.driverId ? 1 : 0) +
    (value.dateFrom ? 1 : 0) +
    (value.dateTo ? 1 : 0) +
    (value.search ? 1 : 0);

  const customerOption = customers.find((item) => item.id === value.customerId) ?? null;
  const driverOption = drivers.find((item) => item.id === value.driverId) ?? null;

  return (
    <section className="space-y-2 rounded border border-gray-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Operating Company</label>
          <Combobox
            options={companies.map((company) => ({
              value: company.id,
              label: company.label,
              sublabel: company.shortName ?? undefined,
            }))}
            value={value.companyIds[0] ?? null}
            onChange={(nextCompanyId) => {
              if (!nextCompanyId) {
                onChange({ ...value, companyIds: [] });
                return;
              }
              onChange({ ...value, companyIds: [nextCompanyId] });
            }}
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

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
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
          <input
            type="date"
            value={value.dateFrom}
            onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Date To</label>
          <input
            type="date"
            value={value.dateTo}
            onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Search</label>
          <input
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Load #, customer, stop city"
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
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
          <button
            type="button"
            onClick={() => onChange({ ...value, customerId: null })}
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
          >
            Customer: {customerOption.label} ×
          </button>
        ) : null}
        {driverOption ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, driverId: null })}
            className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
          >
            Driver: {driverOption.label} ×
          </button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={onClearAll}>
          Clear All Filters
        </Button>
      </div>
    </section>
  );
}
