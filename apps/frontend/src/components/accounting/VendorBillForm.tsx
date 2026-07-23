import type { JSX } from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureDriverVendors, listDrivers, listUnits, listVendors } from "../../api/mdata";
import { getCoaAccounts } from "../../api/banking";
import { classesCatalogClient } from "../../api/catalogs-accounting";
import { DatePicker } from "../forms/DatePicker";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar } from "../forms/shared/TypeTabBar";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { vendorReferenceOption } from "../parity/referenceOptionLabels";
import { Combobox } from "../Combobox";
import { CreateDriverModal } from "../drivers/CreateDriverModal";
import { CreateUnitModal } from "../fleet/CreateUnitModal";
import { UploadZone } from "../UploadZone";
import { EntityLink } from "../shared/EntityLink";
import { companyToday } from "../../lib/businessDate";
import {
  buildVendorBillLinePayloads,
  type VendorBillFormLinePayload,
} from "./vendorBillLines";
import { dueDateFromBillTerms } from "./vendorBillDueDate";

export type { VendorBillFormLinePayload };
export { buildVendorBillLinePayloads };

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
  // HARD cross-module link (maintenance): real FKs — only present when linkage props / unit picker set.
  work_order_id?: string;
  unit_id?: string;
  /** Real bill lines — required for vendor create; createBill persists these in the same txn. */
  lines: VendorBillFormLinePayload[];
};

type Props = {
  operatingCompanyId: string;
  submitting?: boolean;
  onSubmit: (payload: VendorBillFormSubmitPayload) => void | Promise<void>;
  /**
   * Optional HARD FK to maintenance.work_orders — when set, submit payload includes work_order_id.
   * Absent → default accounting create (non-breaking).
   */
  linkedWoId?: string;
  /** Optional WO-context unit prefill + unit_id fallback when the picker is empty. */
  linkedUnitId?: string;
  /** Human-readable WO id for memo + banner (maintenance linkage). */
  linkedWoDisplayId?: string;
  /** Pre-select bill type tab (maintenance | repair | fuel | driver | vendor). */
  initialBillType?: string;
  submitLabel?: string;
  /** Optional test id on the primary submit button (maintenance modal reuse). */
  submitTestId?: string;
  /** Optional cancel control (maintenance modal keeps Cancel + Create). */
  onCancel?: () => void;
  cancelLabel?: string;
};

function lineSubtotal(lines: TwoSectionLine[]) {
  return lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
}

function buildMemoContext(opts: {
  billType: string;
  taxRate: number;
  taxAmount: number;
  accountLabel?: string;
  linkedWoDisplayId?: string;
  loadNumber: string;
  driverId: string;
  unitId: string;
  className: string;
  terms: string;
}) {
  const parts = [
    `bill_type:${opts.billType}`,
    `tax_rate:${opts.taxRate}`,
  ];
  if (opts.taxAmount > 0) {
    parts.push(`tax_amount_display_only:${opts.taxAmount.toFixed(2)}`);
  }
  if (opts.accountLabel) parts.push(`ap_account_hint:${opts.accountLabel}`);
  if (opts.linkedWoDisplayId) parts.push(`WO: ${opts.linkedWoDisplayId}`);
  if (opts.loadNumber.trim()) parts.push(`load:${opts.loadNumber.trim()}`);
  if (opts.driverId) parts.push(`driver:${opts.driverId}`);
  if (opts.unitId) parts.push(`unit:${opts.unitId}`);
  if (opts.className.trim()) parts.push(`class:${opts.className.trim()}`);
  if (opts.terms) parts.push(`terms:${opts.terms}`);
  return parts.join(" · ");
}

export function VendorBillForm({
  operatingCompanyId,
  submitting = false,
  onSubmit,
  linkedWoId,
  linkedUnitId,
  linkedWoDisplayId,
  initialBillType,
  submitLabel = "Create bill",
  submitTestId,
  onCancel,
  cancelLabel = "Cancel",
}: Props) {
  const resolvedInitialBillType =
    initialBillType && BILL_TYPE_TABS.some((tab) => tab.id === initialBillType) ? initialBillType : "repair";
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [billType, setBillType] = useState(resolvedInitialBillType);
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [billDate, setBillDate] = useState(() => companyToday());
  const [dueDate, setDueDate] = useState(() => dueDateFromBillTerms(companyToday(), "net_30"));
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [terms, setTerms] = useState("net_30");
  const [vendorId, setVendorId] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState(linkedUnitId ?? "");
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  const [unitCreateOpen, setUnitCreateOpen] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [className, setClassName] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountDisplay, setAccountDisplay] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Prefill unit from WO context without clobbering a user picker change.
  useEffect(() => {
    if (!linkedUnitId) return;
    setUnitId((prev) => prev || linkedUnitId);
  }, [linkedUnitId]);

  useEffect(() => {
    if (!initialBillType || !BILL_TYPE_TABS.some((tab) => tab.id === initialBillType)) return;
    setBillType(initialBillType);
  }, [initialBillType]);

  // QBO parity: Bill Date + Terms auto-fill Due Date until the operator overrides Due Date.
  useEffect(() => {
    if (dueDateTouched) return;
    const next = dueDateFromBillTerms(billDate, terms);
    if (next) setDueDate(next);
  }, [billDate, terms, dueDateTouched]);

  const vendorsQuery = useQuery({
    queryKey: ["vendor-bill-form", "vendors", operatingCompanyId],
    queryFn: async () => {
      // Ensure Active drivers exist as mdata.vendors (driver-as-vendor) before listing.
      try {
        await ensureDriverVendors(operatingCompanyId);
      } catch {
        // Read path still works if ensure is forbidden for the role — picker shows existing vendors.
      }
      return listVendors({ operating_company_id: operatingCompanyId, limit: 5000, status: "active" });
    },
    enabled: Boolean(operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["vendor-bill-form", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId, limit: 200 }), // full active set (endpoint default 50 truncates >50)
    enabled: Boolean(operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["vendor-bill-form", "units", operatingCompanyId],
    // Fleet enum is InService (not "Active") — status=Active was silently dropped server-side; pin InService.
    queryFn: () => listUnits({ status: "InService", operating_company_id: operatingCompanyId, limit: 500 }),
    enabled: Boolean(operatingCompanyId),
  });
  const accountsQuery = useQuery({
    queryKey: ["vendor-bill-form", "ap-accounts", operatingCompanyId],
    // Entity-scoped CoA (same as banking categorize) — never the user's default company chart.
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const classesQuery = useQuery({
    queryKey: ["vendor-bill-form", "classes", operatingCompanyId],
    queryFn: () =>
      classesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 200 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption),
    [vendorsQuery.data?.vendors]
  );

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((driver) => ({
        value: driver.id,
        label: [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id,
      })),
    [driversQuery.data?.drivers]
  );

  // Unit picker — same "Combobox + canonical CreateUnitModal" pattern as Driver above (no
  // createKind="unit" on ReferenceSelect yet; CreateUnitModal is the single canonical fleet-roster
  // unit creator — writes mdata.units, same table unitsQuery reads, so a created unit selects +
  // survives reload).
  const unitOptions = useMemo(
    () =>
      ((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((unit) => ({
        value: String(unit.id ?? ""),
        label: String(unit.unit_number ?? unit.id ?? ""),
      })),
    [unitsQuery.data?.units]
  );

  // A/P account picker — Liability / AccountsPayable postable accounts (canonical catalogs.accounts).
  const apAccountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        .filter((acct) => {
          const type = String(acct.account_type ?? "");
          const subtype = String((acct as { account_subtype?: string | null }).account_subtype ?? "").toLowerCase();
          const name = String(acct.account_name ?? "").toLowerCase();
          const deactivated = (acct as { deactivated_at?: string | null }).deactivated_at;
          if (deactivated) return false;
          return (
            type === "Liability" ||
            subtype.includes("payable") ||
            name.includes("accounts payable")
          );
        })
        .map((acct) => ({
          value: acct.id,
          label: acct.account_number ? `${acct.account_number} · ${acct.account_name}` : acct.account_name,
          type: acct.account_type ?? undefined,
        })),
    [accountsQuery.data?.accounts]
  );

  const classOptions = useMemo(
    () =>
      (classesQuery.data?.rows ?? []).map((row) => ({
        value: row.id,
        label: row.display_name || row.code,
        type: row.code,
      })),
    [classesQuery.data?.rows]
  );

  const subtotal = lineSubtotal(lines);
  const taxAmount = (subtotal * taxRate) / 100;
  const linePayloads = useMemo(() => buildVendorBillLinePayloads(lines), [lines]);
  const lineSumCents = linePayloads.reduce((sum, line) => sum + line.amount_cents, 0);
  // Bill amount = SUM(line amounts). Tax is display-only until a tax expense line with a real
  // account_id is supported — never invent a tax GL account (owner law).
  const amountCents = lineSumCents;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const vendorKey = vendorId.trim();
    if (!vendorKey) return;
    if (amountCents <= 0) {
      setFormError("Add at least one line with an amount greater than zero.");
      return;
    }
    if (linePayloads.length === 0) {
      setFormError("Bill lines are required — amounts cannot be memo-only.");
      return;
    }
    const sectionAMissingAccount = linePayloads.some(
      (line) => line.section === "A" && !line.account_id
    );
    if (sectionAMissingAccount) {
      setFormError("Each Category (Section A) line needs a Chart of Accounts category.");
      return;
    }

    const resolvedUnitId = unitId || linkedUnitId || undefined;

    await onSubmit({
      vendor_id: vendorKey,
      bill_number: billNumber.trim() || undefined,
      bill_date: billDate,
      due_date: dueDate.trim() || undefined,
      amount_cents: amountCents,
      memo: buildMemoContext({
        billType,
        taxRate,
        taxAmount,
        accountLabel: accountDisplay || undefined,
        linkedWoDisplayId,
        loadNumber,
        driverId,
        unitId,
        className,
        terms,
      }),
      coa_account_id: accountId ?? undefined,
      attachment_draft_id: draftAttachmentEntityId,
      lines: linePayloads,
      // HARD cross-module FKs — only when linkage / picker supplies them.
      ...(linkedWoId ? { work_order_id: linkedWoId } : {}),
      ...(resolvedUnitId ? { unit_id: resolvedUnitId } : {}),
    });
  }

  return (
    <>
    <form className="space-y-3" onSubmit={handleSubmit}>
      {linkedWoId && linkedWoDisplayId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
          Linked — <EntityLink kind="work_order" id={linkedWoId} label={linkedWoDisplayId} />
        </div>
      ) : null}
      <TypeTabBar tabs={BILL_TYPE_TABS} activeId={billType} onChange={setBillType} />

      {/* CHROME-10: flat sections — no nested bordered panel inside the drawer */}
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Bill Details</div>
      </div>

      <div className="grid gap-2 md:grid-cols-6">
        <Field label="Bill Type *">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-xs"
            value={BILL_TYPE_TABS.find((t) => t.id === billType)?.label ?? "Repair Bill"}
            readOnly
          />
        </Field>
        <Field label="Bill Date *">
          <DatePicker className="w-full" value={billDate} onChange={setBillDate} />
        </Field>
        <Field label="Terms">
          {/* Flat native select — SelectCombobox wraps Combobox with its own border (box-in-box). */}
          <select
            className="h-8 w-full rounded-sm border border-gray-300 bg-white px-2 text-xs"
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            aria-label="Terms"
          >
            <option value="net_30">Net 30</option>
            <option value="net_15">Net 15</option>
            <option value="net_7">Net 7</option>
            <option value="due_on_receipt">Due on receipt</option>
          </select>
        </Field>
        <Field label="Due Date *">
          <DatePicker
            className="w-full"
            value={dueDate}
            onChange={(next) => {
              setDueDateTouched(true);
              setDueDate(next);
            }}
          />
        </Field>
        <Field label="Bill Number *">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={billNumber}
            onChange={(event) => setBillNumber(event.target.value)}
            placeholder="Bill Number"
          />
        </Field>
        <Field label="A/P Account *">
          <ReferenceSelect
            value={accountId}
            onChange={(next) => {
              setAccountId(next);
              const match = apAccountOptions.find((o) => o.value === next);
              setAccountDisplay(match?.label ?? "");
            }}
            options={apAccountOptions}
            createKind="category"
            addNewLabel="+ Add new account"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select A/P account…"
            disabled={!operatingCompanyId}
            onOptionCreated={(opt) => {
              setAccountId(opt.value);
              setAccountDisplay(opt.label);
            }}
          />
        </Field>

        <div className="md:col-span-6 h-2" />
        <Field label="Vendor *">
          <>
          {/* A3: shared ReferenceSelect gives the vendor picker the inline "+ Add new vendor" row
              (writes to canonical mdata.vendors — same table vendorOptions reads from, so a newly
              created vendor is immediately selectable, QB-STD-5). */}
          <ReferenceSelect
            value={vendorId || null}
            onChange={(next) => setVendorId(next ?? "")}
            options={vendorOptions}
            createKind="vendor"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select vendor..."
            disabled={!operatingCompanyId}
          />
          {/* CHAIN-01: never leave the vendor picker silently blank — say WHY it's empty so an empty
              dropdown reads as an honest data/scoping signal, not a broken control. */}
          {!operatingCompanyId ? (
            <p className="mt-1 text-[11px] text-slate-600">Select an operating company to load vendors.</p>
          ) : vendorsQuery.isLoading ? (
            <p className="mt-1 text-[11px] text-gray-500">Loading vendors…</p>
          ) : vendorsQuery.isError ? (
            <p className="mt-1 text-[11px] text-red-600">Couldn't load vendors. Refresh to try again.</p>
          ) : vendorOptions.length === 0 ? (
            <p className="mt-1 text-[11px] text-slate-600">No vendors found for this company. Create a vendor first, or check the selected company.</p>
          ) : null}
          </>
        </Field>
        <Field label="Load Number">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            placeholder="Load Number"
            value={loadNumber}
            onChange={(event) => setLoadNumber(event.target.value)}
          />
        </Field>
        <div className="md:col-span-4" />

        <div className="md:col-span-6 h-2" />
        <Field label="Driver">
          <Combobox
            options={driverOptions}
            value={driverId || null}
            onChange={(next) => setDriverId(next ?? "")}
            placeholder="Select driver..."
            loading={driversQuery.isLoading}
            allowClear
            allowAddNew={{
              label: "+ Create driver",
              onAdd: () => setDriverCreateOpen(true),
            }}
          />
        </Field>
        <Field label="Unit">
          <Combobox
            options={unitOptions}
            value={unitId || null}
            onChange={(next) => setUnitId(next ?? "")}
            placeholder="Select unit..."
            loading={unitsQuery.isLoading}
            allowClear
            allowAddNew={{
              label: "+ Create unit",
              onAdd: () => setUnitCreateOpen(true),
            }}
          />
        </Field>
        <div className="md:col-span-3" />
        <Field label="Class">
          <ReferenceSelect
            value={classId}
            onChange={(next) => {
              setClassId(next);
              const match = classOptions.find((o) => o.value === next);
              setClassName(match?.label ?? "");
            }}
            options={classOptions}
            createKind="class"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select class…"
            disabled={!operatingCompanyId}
            onOptionCreated={(opt) => {
              setClassId(opt.value);
              setClassName(opt.label);
            }}
          />
        </Field>
      </div>

      <TwoSectionLineEditor mode="bill" onChange={setLines} partsLaborMode="parts-and-labor" />
      <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Bill Total = A + B" />

      <div className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
        Line amounts post to <code className="text-[10px]">accounting.bill_lines</code> with the bill header
        (same transaction). Tax shown above is display-only until a tax expense line with a real CoA
        account is entered — the bill amount equals the sum of lines (no invented tax GL).
      </div>
      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <UploadZone
        operatingCompanyId={operatingCompanyId}
        entityType="bill"
        entityId={draftAttachmentEntityId}
        defaultCategory="vendor_invoice"
        title="Bill Attachments"
      />

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        ) : null}
        <button
          type="submit"
          data-testid={submitTestId}
          disabled={submitting || !operatingCompanyId || amountCents <= 0 || !vendorId.trim()}
          className="rounded-sm bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
    <CreateDriverModal
      open={driverCreateOpen}
      companyId={operatingCompanyId}
      onClose={() => setDriverCreateOpen(false)}
      onCreated={(createdId) => {
        setDriverId(createdId);
        setDriverCreateOpen(false);
        void driversQuery.refetch();
      }}
      // CHROME-11: VendorBillForm renders inside the Bill ParityDrawer (VendorBillCreatePage /
      // CreateBillModal) — the nested driver creator must stack as a ParityDrawer, never a
      // centered Modal on top of the already-open Bill drawer.
      shell="drawer"
    />
    <CreateUnitModal
      open={unitCreateOpen}
      operatingCompanyId={operatingCompanyId}
      onClose={() => setUnitCreateOpen(false)}
      onCreated={(createdId) => {
        setUnitId(createdId);
        setUnitCreateOpen(false);
        void unitsQuery.refetch();
      }}
    />
    </>
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
