import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers, listUnits, listVendors } from "../../api/mdata";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar } from "../forms/shared/TypeTabBar";
import { QboCombobox } from "../forms/QboCombobox";
import { SelectCombobox } from "../shared/SelectCombobox";
import { UploadZone } from "../UploadZone";

export type VendorBillFormSubmitPayload = {
  vendor_id: string;
  bill_number?: string;
  bill_date: string;
  due_date?: string;
  amount_cents: number;
  memo?: string;
  coa_account_id?: string;
  // Draft id used by UploadZone for create-time attachments; sent so the backend reconciles the
  // uploaded files onto the new bill (Option B — otherwise the attachment orphans).
  attachment_draft_id?: string;
};

type Props = {
  operatingCompanyId: string;
  submitting?: boolean;
  onSubmit: (payload: VendorBillFormSubmitPayload) => void | Promise<void>;
};

function lineSubtotal(lines: TwoSectionLine[]) {
  return lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
}

function buildContractStubMemo(lines: TwoSectionLine[], taxRate: number, billType: string, accountLabel?: string) {
  const parts = [
    "bill_form_stub:v1",
    `bill_type:${billType}`,
    `line_count:${lines.length}`,
    `tax_rate:${taxRate}`,
  ];
  if (accountLabel) parts.push(`ap_account_hint:${accountLabel}`);
  if (lines.length) {
    const preview = lines
      .slice(0, 4)
      .map((line) => `${line.section}:${line.description || "line"}=${Number(line.amount || 0).toFixed(2)}`)
      .join("; ");
    parts.push(`lines_preview:${preview}`);
  }
  return parts.join(" · ");
}

export function VendorBillForm({ operatingCompanyId, submitting = false, onSubmit }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [billType, setBillType] = useState("repair");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [terms, setTerms] = useState("net_30");
  const [vendorId, setVendorId] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [className, setClassName] = useState("");
  const [accountQboId, setAccountQboId] = useState<string | null>(null);
  const [accountDisplay, setAccountDisplay] = useState("");

  const vendorsQuery = useQuery({
    queryKey: ["vendor-bill-form", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["vendor-bill-form", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["vendor-bill-form", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });

  const vendorOptions = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
    [vendorsQuery.data?.vendors]
  );

  const subtotal = lineSubtotal(lines);
  const taxAmount = (subtotal * taxRate) / 100;
  const totalCents = Math.round((subtotal + taxAmount) * 100);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const vendorKey = vendorId.trim();
    if (!vendorKey) return;
    if (totalCents <= 0) return;

    const memoParts = [buildContractStubMemo(lines, taxRate, billType, accountDisplay || undefined)];
    if (loadNumber.trim()) memoParts.push(`load:${loadNumber.trim()}`);
    if (driverId) memoParts.push(`driver:${driverId}`);
    if (unitId) memoParts.push(`unit:${unitId}`);
    if (className.trim()) memoParts.push(`class:${className.trim()}`);
    if (terms) memoParts.push(`terms:${terms}`);

    await onSubmit({
      vendor_id: vendorKey,
      bill_number: billNumber.trim() || undefined,
      bill_date: billDate,
      due_date: dueDate.trim() || undefined,
      amount_cents: totalCents,
      memo: memoParts.join(" · "),
      coa_account_id: accountQboId && accountQboId.includes("-") ? accountQboId : undefined,
      attachment_draft_id: draftAttachmentEntityId,
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <TypeTabBar tabs={BILL_TYPE_TABS} activeId={billType} onChange={setBillType} />

      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
        Bill Details
      </div>

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
        <Field label="Bill Type *">
          <input
            className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs"
            value={BILL_TYPE_TABS.find((t) => t.id === billType)?.label ?? "Repair Bill"}
            readOnly
          />
        </Field>
        <Field label="Bill Date *">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            type="date"
            value={billDate}
            onChange={(event) => setBillDate(event.target.value)}
          />
        </Field>
        <Field label="Terms">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
          >
            <option value="net_30">Net 30</option>
            <option value="net_15">Net 15</option>
            <option value="net_7">Net 7</option>
          </SelectCombobox>
        </Field>
        <Field label="Due Date *">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
        <Field label="Bill Number *">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={billNumber}
            onChange={(event) => setBillNumber(event.target.value)}
            placeholder="Bill Number"
          />
        </Field>
        <Field label="A/P Account *">
          <QboCombobox
            entityType="account"
            operatingCompanyId={operatingCompanyId}
            value={accountQboId}
            displayValue={accountDisplay}
            onChange={(qboId, displayName) => {
              setAccountQboId(qboId);
              setAccountDisplay(displayName);
            }}
          />
        </Field>

        <div className="md:col-span-6 h-2" />
        <Field label="Vendor *">
          <>
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
          >
            <option value="">Select vendor...</option>
            {vendorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectCombobox>
          {/* CHAIN-01: never leave the vendor picker silently blank — say WHY it's empty so an empty
              dropdown reads as an honest data/scoping signal, not a broken control. */}
          {!operatingCompanyId ? (
            <p className="mt-1 text-[11px] text-amber-700">Select an operating company to load vendors.</p>
          ) : vendorsQuery.isLoading ? (
            <p className="mt-1 text-[11px] text-gray-500">Loading vendors…</p>
          ) : vendorsQuery.isError ? (
            <p className="mt-1 text-[11px] text-red-600">Couldn't load vendors. Refresh to try again.</p>
          ) : vendorOptions.length === 0 ? (
            <p className="mt-1 text-[11px] text-amber-700">No vendors found for this company. Create a vendor first, or check the selected company.</p>
          ) : null}
          </>
        </Field>
        <Field label="Load Number">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            placeholder="Load Number"
            value={loadNumber}
            onChange={(event) => setLoadNumber(event.target.value)}
          />
        </Field>
        <div className="md:col-span-4" />

        <div className="md:col-span-6 h-2" />
        <Field label="Driver">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">Select driver...</option>
            {(driversQuery.data?.drivers ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>
                {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <Field label="Unit">
          <SelectCombobox
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
          >
            <option value="">Select unit...</option>
            {((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((unit) => (
              <option key={String(unit.id ?? "")} value={String(unit.id ?? "")}>
                {String(unit.unit_number ?? unit.id ?? "")}
              </option>
            ))}
          </SelectCombobox>
        </Field>
        <div className="md:col-span-3" />
        <Field label="Class">
          <input
            className="h-8 w-full rounded border border-gray-300 px-2 text-xs"
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            placeholder="Class"
          />
        </Field>
      </div>

      <TwoSectionLineEditor mode="bill" onChange={setLines} partsLaborMode="parts-and-labor" />
      <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Bill Total = A + B" />

      <div className="rounded border border-sky-100 bg-sky-50 px-3 py-2 text-[11px] text-sky-900">
        Line-level bill persistence posts a single vendor bill total until multi-line bill API ships.
      </div>

      <UploadZone
        operatingCompanyId={operatingCompanyId}
        entityType="bill"
        entityId={draftAttachmentEntityId}
        defaultCategory="vendor_invoice"
        title="Bill Attachments"
      />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !operatingCompanyId || totalCents <= 0 || !vendorId.trim()}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Create bill"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {children}
    </div>
  );
}
