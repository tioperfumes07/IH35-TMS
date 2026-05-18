import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllAccounts } from "../../../../api/banking";
import { listVendors, listDrivers, listUnits } from "../../../../api/mdata";
import { getWoCostContext } from "../../../../api/maintenance";
import {
  CostBreakdownBox,
  type CategoryLine,
  type CostContextOption,
  type ItemLine,
} from "../../../../components/forms/shared/CostBreakdownBox";
import { SelectCombobox } from "../../../../components/shared/SelectCombobox";

type Props = {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  operatingCompanyId: string;
};

function parseCategoryLines(value: Record<string, unknown>): CategoryLine[] {
  const rows = value.section_a_lines;
  if (!Array.isArray(rows)) return [];
  return rows as CategoryLine[];
}

function parseItemLines(value: Record<string, unknown>): ItemLine[] {
  const rows = value.section_b_lines;
  if (!Array.isArray(rows)) return [];
  return rows as ItemLine[];
}

export function ApplyToBillForm({ value, onChange, operatingCompanyId }: Props) {
  const vendorsQuery = useQuery({
    queryKey: ["categorize-bill", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["categorize-bill", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["categorize-bill", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["categorize-bill", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const costContextQuery = useQuery({
    queryKey: ["categorize-bill", "cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const sectionALines = useMemo(() => parseCategoryLines(value), [value]);
  const sectionBLines = useMemo(() => parseItemLines(value), [value]);
  const expenseCategoryOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.name ?? ""),
      })),
    [costContextQuery.data?.expense_categories]
  );
  const itemOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.items ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.name ?? ""),
      })),
    [costContextQuery.data?.items]
  );
  const partOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.parts ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.part_description ?? entry.name ?? ""),
      })),
    [costContextQuery.data?.parts]
  );
  const locationOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.parts ?? [])
        .map((entry) => String(entry.location ?? entry.location_label ?? entry.bin_location ?? "").trim())
        .filter(Boolean)
        .filter((label, index, all) => all.indexOf(label) === index)
        .map((label) => ({ id: label.toLowerCase(), label })),
    [costContextQuery.data?.parts]
  );

  return (
    <div className="space-y-2 text-xs">
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        Bill Details
      </div>
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Bill Date">
          <input
            type="date"
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.bill_date ?? "")}
            onChange={(event) => onChange({ ...value, bill_date: event.target.value })}
          />
        </Field>
        <Field label="Terms">
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={String(value.terms ?? "")} onChange={(event) => onChange({ ...value, terms: event.target.value })}>
            <option value="">Select terms...</option>
            <option value="net_30">Net 30</option>
            <option value="net_15">Net 15</option>
            <option value="net_7">Net 7</option>
          </SelectCombobox>
        </Field>
        <Field label="Due Date">
          <input
            type="date"
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.due_date ?? "")}
            onChange={(event) => onChange({ ...value, due_date: event.target.value })}
          />
        </Field>
        <Field label="Bill Number">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.bill_number ?? "")}
            onChange={(event) => onChange({ ...value, bill_number: event.target.value })}
          />
        </Field>
        <Field label="Vendor">
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={String(value.vendor_id ?? "")} onChange={(event) => onChange({ ...value, vendor_id: event.target.value })}>
            <option value="">Select vendor...</option>
            {(vendorsQuery.data?.vendors ?? []).map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="A/P Account">
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={String(value.ap_account_id ?? "")} onChange={(event) => onChange({ ...value, ap_account_id: event.target.value })}>
            <option value="">Select account...</option>
            {(accountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => (
              <option key={String(account.id ?? "")} value={String(account.id ?? "")}>
                {String(account.display_name ?? "Account")}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Load Number">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.load_number ?? "")}
            onChange={(event) => onChange({ ...value, load_number: event.target.value })}
          />
        </Field>
        <Field label="Driver">
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={String(value.driver_id ?? "")} onChange={(event) => onChange({ ...value, driver_id: event.target.value })}>
            <option value="">Select driver...</option>
            {(driversQuery.data?.drivers ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>
                {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Unit">
          <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={String(value.unit_id ?? "")} onChange={(event) => onChange({ ...value, unit_id: event.target.value })}>
            <option value="">Select unit...</option>
            {((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((unit) => (
              <option key={String(unit.id ?? "")} value={String(unit.id ?? "")}>
                {String(unit.unit_number ?? unit.id ?? "")}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Class">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.class_name ?? "")}
            onChange={(event) => onChange({ ...value, class_name: event.target.value })}
          />
        </Field>
      </div>

      <CostBreakdownBox
        sectionA={{ lines: sectionALines }}
        sectionB={{ lines: sectionBLines }}
        expenseCategoryOptions={expenseCategoryOptions}
        itemOptions={itemOptions}
        partOptions={partOptions}
        locationOptions={locationOptions}
        partsLaborMode="parts-and-labor"
        onSectionAChange={(lines) => onChange({ ...value, section_a_lines: lines })}
        onSectionBChange={(lines) => onChange({ ...value, section_b_lines: lines })}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <label className="space-y-1">
      <span className="text-[11px] font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
