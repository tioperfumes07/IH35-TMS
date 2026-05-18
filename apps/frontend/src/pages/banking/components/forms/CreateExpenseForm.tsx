import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllAccounts } from "../../../../api/banking";
import { listVendors } from "../../../../api/mdata";
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

export function CreateExpenseForm({ value, onChange, operatingCompanyId }: Props) {
  const vendorsQuery = useQuery({
    queryKey: ["categorize-expense", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["categorize-expense", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const costContextQuery = useQuery({
    queryKey: ["categorize-expense", "cost-context", operatingCompanyId],
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
        Expense Details
      </div>
      <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Expense Date">
          <input
            type="date"
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.expense_date ?? "")}
            onChange={(event) => onChange({ ...value, expense_date: event.target.value })}
          />
        </Field>
        <Field label="Expense Number">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.expense_number ?? "")}
            onChange={(event) => onChange({ ...value, expense_number: event.target.value })}
          />
        </Field>
        <Field label="Vendor">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.vendor_id ?? "")}
            onChange={(event) => onChange({ ...value, vendor_id: event.target.value })}
          >
            <option value="">Select vendor...</option>
            {(vendorsQuery.data?.vendors ?? []).map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Pay From Account">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.expense_account_id ?? "")}
            onChange={(event) => onChange({ ...value, expense_account_id: event.target.value })}
          >
            <option value="">Select account...</option>
            {(accountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => (
              <option key={String(account.id ?? "")} value={String(account.id ?? "")}>
                {String(account.display_name ?? "Account")}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Payment Method">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.payment_method ?? "")}
            onChange={(event) => onChange({ ...value, payment_method: event.target.value })}
          >
            <option value="">Select method...</option>
            <option value="ach">ACH</option>
            <option value="check">Check</option>
            <option value="wire">Wire</option>
            <option value="credit_card">Credit Card</option>
            <option value="cash">Cash</option>
          </SelectCombobox>
        </Field>
        <Field label="Location">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={String(value.location ?? "")}
            onChange={(event) => onChange({ ...value, location: event.target.value })}
          >
            <option value="">Select location...</option>
            {locationOptions.map((location) => (
              <option key={location.id} value={location.label}>
                {location.label}
              </option>
            ))}
          </SelectCombobox>
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
