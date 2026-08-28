import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAllCustomers, listCustomers } from "../../api/mdata";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityPicker } from "../parity/EntityPicker";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { CollapsedListFilters, TableSearch, ColumnChooser, useStagedListFilters, type TableColumn } from "../../components/table";
import { Button } from "../Button";
import { Combobox } from "../Combobox";
import { ListErrorState } from "../ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
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

type CompanyOption = {
  id: string;
  label: string;
  shortName?: string | null;
};

type Props = {
  value: DispatchFilterState;
  onChange: (next: DispatchFilterState) => void;
  companies: CompanyOption[];
  operatingCompanyId: string;
  onClearAll: () => void;
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
  operatingCompanyId,
  columns,
  hiddenColumns,
  onToggleColumn,
  pageSize,
  onPageSizeChange,
}: Props) {
  const [customerSearch, setCustomerSearch] = useState("");
  const staged = useStagedListFilters({
    applied: value,
    empty: { ...value, companyIds: [], statuses: [], customerId: null, driverId: null, dateMode: "pickup", dateFrom: "", dateTo: "" },
    onApply: onChange,
  });
  const draft = staged.draft;

  const customersQuery = useQuery({
    queryKey: ["dispatch-filter", "customers", operatingCompanyId, customerSearch],
    queryFn: () =>
      customerSearch
        ? listCustomers({
            operating_company_id: operatingCompanyId,
            status: "active",
            limit: 200,
            search: customerSearch,
          })
        : listAllCustomers({
            operating_company_id: operatingCompanyId,
            status: "active",
          }),
    enabled: Boolean(operatingCompanyId),
  });

  const onSearchChange = useCallback(
    (search: string) => {
      onChange({ ...value, search });
    },
    [onChange, value],
  );

  const customerOptions = useMemo(
    () =>
      (customersQuery.data?.customers ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        type: c.customer_code ?? undefined,
      })),
    [customersQuery.data?.customers]
  );

  const activeCount =
    value.companyIds.length +
    value.statuses.length +
    (value.customerId ? 1 : 0) +
    (value.driverId ? 1 : 0) +
    (value.dateFrom ? 1 : 0) +
    (value.dateTo ? 1 : 0);

  const customerOption = customerOptions.find((item) => item.value === draft.customerId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-dispatch-toolbar="true">
      <CollapsedListFilters
        activeFilterCount={activeCount}
        testIdPrefix="dispatch"
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        searchSlot={
          <TableSearch
            value={value.search}
            onChange={onSearchChange}
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
              value={draft.companyIds[0] ?? null}
              onChange={(nextCompanyId) => staged.setDraft({ ...draft, companyIds: nextCompanyId ? [nextCompanyId] : [] })}
              placeholder="Select company"
              allowClear
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              options={ALL_LOAD_STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
              value={draft.statuses[0] ?? null}
              onChange={(nextStatus) => {
                if (!nextStatus) {
                  staged.setDraft({ ...draft, statuses: [] });
                  return;
                }
                const statusValue = nextStatus as LoadStatus;
                const exists = draft.statuses.includes(statusValue);
                const statuses = exists ? draft.statuses.filter((status) => status !== statusValue) : [...draft.statuses, statusValue];
                staged.setDraft({ ...draft, statuses });
              }}
              placeholder="Select status (multi)"
              allowClear
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Customer</label>
            {customersQuery.isError ? (
              <ListErrorState
                title="Couldn't load customers"
                {...formatQueryErrorDetail(customersQuery.error)}
                onRetry={() => void customersQuery.refetch()}
              />
            ) : (
              <ReferenceSelect
                value={draft.customerId}
                onChange={(customerId) => staged.setDraft({ ...draft, customerId })}
                options={customerOptions}
                createKind="customer"
                operatingCompanyId={operatingCompanyId}
                placeholder="Search customer"
                disabled={!operatingCompanyId || customersQuery.isLoading || customersQuery.isError}
                loading={customersQuery.isLoading}
                onSearch={setCustomerSearch}
              />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Driver</label>
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={draft.driverId}
              onChange={(driverId) => staged.setDraft({ ...draft, driverId })}
              allowCreate={false}
              placeholder="Search driver"
              disabled={!operatingCompanyId}
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
                  variant={draft.dateMode === mode ? "primary" : "secondary"}
                  onClick={() => staged.setDraft({ ...draft, dateMode: mode })}
                >
                  {mode === "pickup" ? "Pickup" : "Delivery"}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Date From</label>
            <DatePicker value={draft.dateFrom} onChange={(next) => staged.setDraft({ ...draft, dateFrom: next })} className="w-full" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600">Date To</label>
            <DatePicker value={draft.dateTo} onChange={(next) => staged.setDraft({ ...draft, dateTo: next })} className="w-full" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2 text-xs">
          <span className="rounded-sm bg-gray-100 px-2 py-1 text-gray-700">Active filters: {activeCount}</span>
          {draft.companyIds.map((id) => {
            const company = companies.find((item) => item.id === id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => staged.setDraft({ ...draft, companyIds: draft.companyIds.filter((companyId) => companyId !== id) })}
                className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50"
              >
                Company: {company?.label ?? id} ×
              </button>
            );
          })}
          {draft.statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => staged.setDraft({ ...draft, statuses: draft.statuses.filter((item) => item !== status) })}
              className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              Status: {STATUS_LABEL[status]} ×
            </button>
          ))}
          {customerOption ? (
            <button type="button" onClick={() => staged.setDraft({ ...draft, customerId: null })} className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Customer: {customerOption.label} ×
            </button>
          ) : null}
          {draft.driverId ? (
            <button type="button" onClick={() => staged.setDraft({ ...draft, driverId: null })} className="rounded-sm border border-gray-300 px-2 py-1 hover:bg-gray-50">
              Driver filter ×
            </button>
          ) : null}
          <Button type="button" size="sm" variant="secondary" onClick={staged.reset}>
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
