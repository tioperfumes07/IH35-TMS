// @archived — Workflow-B form: superseded by BankingTransactionsDesignView categorization. Enforced by verify-banking-workflow-b-archived.mjs.
import type { JSX } from "react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCatalogAccounts } from "../../../../api/catalog-accounts";
import { listVendors, listUnits } from "../../../../api/mdata";
import { getWoCostContext } from "../../../../api/maintenance";
import {
  CostBreakdownBox,
  type CategoryLine,
  type CostContextOption,
  type ItemLine,
} from "../../../../components/forms/shared/CostBreakdownBox";
import { DatePicker } from "../../../../components/forms/DatePicker";
import { DriverPickerWithCreate } from "../../../../components/drivers/DriverPickerWithCreate";
import { ReferenceSelect } from "../../../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../../../components/parity/referenceOptionLabels";
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
  const unitsQuery = useQuery({
    queryKey: ["categorize-bill", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["categorize-bill", "ap-accounts", operatingCompanyId],
    // LST-F14: apply-to-bill payment account — server-side is_postable=true.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const costContextQuery = useQuery({
    queryKey: ["categorize-bill", "cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const sectionALines = useMemo(() => parseCategoryLines(value), [value]);
  const sectionBLines = useMemo(() => parseItemLines(value), [value]);
  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption),
    [vendorsQuery.data?.vendors]
  );
  // A/P account picker — Liability / AccountsPayable postable accounts (canonical catalogs.accounts),
  // matching VendorBillForm's A/P Account pattern (chrome-plus-01-creators).
  const apAccountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        .filter(
          (acct) =>
            acct.is_postable &&
            !acct.deactivated_at &&
            (acct.account_type === "Liability" ||
              String(acct.account_subtype ?? "").toLowerCase().includes("payable") ||
              String(acct.account_name ?? "").toLowerCase().includes("accounts payable"))
        )
        .map((acct) => ({
          value: acct.id,
          label: acct.account_name,
          type: acct.account_type ?? undefined,
        })),
    [accountsQuery.data?.accounts]
  );
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
      <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        Bill Details
      </div>
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Bill Date">
          <DatePicker
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.bill_date ?? "")}
            onChange={(next) => onChange({ ...value, bill_date: next })}
          />
        </Field>
        <Field label="Terms">
          <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={String(value.terms ?? "")} onChange={(event) => onChange({ ...value, terms: event.target.value })}>
            <option value="">Select terms...</option>
            <option value="net_30">Net 30</option>
            <option value="net_15">Net 15</option>
            <option value="net_7">Net 7</option>
          </SelectCombobox>
        </Field>
        <Field label="Due Date">
          <DatePicker
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.due_date ?? "")}
            onChange={(next) => onChange({ ...value, due_date: next })}
          />
        </Field>
        <Field label="Bill Number">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.bill_number ?? "")}
            onChange={(event) => onChange({ ...value, bill_number: event.target.value })}
          />
        </Field>
        <Field label="Vendor">
          <ReferenceSelect
            value={value.vendor_id ? String(value.vendor_id) : null}
            onChange={(next) => onChange({ ...value, vendor_id: next ?? "" })}
            options={vendorOptions}
            createKind="vendor"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select vendor..."
            disabled={!operatingCompanyId}
          />
        </Field>
        <Field label="A/P Account">
          <ReferenceSelect
            value={value.ap_account_id ? String(value.ap_account_id) : null}
            onChange={(next) => onChange({ ...value, ap_account_id: next ?? "" })}
            options={apAccountOptions}
            createKind="account"
            addNewLabel="+ Add new account"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select A/P account…"
            disabled={!operatingCompanyId}
          />
        </Field>
        <Field label="Load Number">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={String(value.load_number ?? "")}
            onChange={(event) => onChange({ ...value, load_number: event.target.value })}
          />
        </Field>
        <Field label="Driver">
          {/* CategorizeDrawer parent → nested create uses drawer shell (CHROME-11). */}
          <DriverPickerWithCreate
            operatingCompanyId={operatingCompanyId}
            value={value.driver_id ? String(value.driver_id) : null}
            onChange={(next) => onChange({ ...value, driver_id: next ?? "" })}
            shell="drawer"
            placeholder="Select driver..."
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            disabled={!operatingCompanyId}
          />
        </Field>
        <Field label="Unit">
          <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={String(value.unit_id ?? "")} onChange={(event) => onChange({ ...value, unit_id: event.target.value })}>
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
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
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
