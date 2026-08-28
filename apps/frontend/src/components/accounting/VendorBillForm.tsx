import type { JSX } from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ensureDriverVendors, listVendors } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { classesCatalogClient } from "../../api/catalogs-accounting";
import { DatePicker } from "../forms/DatePicker";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { BILL_TYPE_TABS, TypeTabBar, type BillTypeId } from "../forms/shared/TypeTabBar";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { EntityPicker } from "../parity/EntityPicker";
import { vendorReferenceOption } from "../parity/referenceOptionLabels";
import { UploadZone } from "../UploadZone";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { companyToday } from "../../lib/businessDate";
import {
  buildVendorBillLinePayloads,
  type VendorBillFormLinePayload,
} from "./vendorBillLines";
import { dueDateFromBillTerms } from "./vendorBillDueDate";
import { getNextBillDocumentNumber } from "../../api/accounting";

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
  /** Claim→Bill reverse density — only when linkedClaimId prop set. */
  insurance_claim_id?: string;
  /** ACCT-F5043 — Legal Matter → cost forward FK (accounting.bills.legal_matter_id). */
  legal_matter_id?: string;
  /** QBO Class reporting dimension on bill header. */
  class_id?: string;
  /** Real bill lines — required for vendor create; createBill persists these in the same txn. */
  lines: VendorBillFormLinePayload[];
  /** VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE — marks this bill as demo/test data at CREATION (mirrors
   * the Book Load wizard's `is_sample_data` checkbox). Before this field existed, the only way to
   * mark a fixture bill was to hand-type a "sample tag" into the Memo field (see its placeholder
   * text below) — a human convention the poster and every downstream report ignore. */
  is_sample_data?: boolean;
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
  /** Optional insurance.claim id — stamps insurance_claim_id on create (ACCT-F04 reverse density). */
  linkedClaimId?: string;
  /** Optional legal.matters id — stamps legal_matter_id on create (ACCT-F5043). */
  linkedLegalMatterId?: string;
  /** Human-readable WO id for memo + banner (maintenance linkage). */
  linkedWoDisplayId?: string;
  /** Pre-select bill type tab (maintenance | repair | fuel | driver | vendor). */
  initialBillType?: BillTypeId;
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

/** Exported for guard/selftest — operator memo (Gate-B sample tag) MUST lead; never drop it for chrome metadata. */
export function buildMemoContext(opts: {
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
  /** Operator-entered memo / sample tag — prepended so purge can find USMCA_GATEB_SAMPLE_* in bills.memo */
  operatorMemo?: string;
}) {
  const parts: string[] = [];
  const operator = opts.operatorMemo?.trim();
  if (operator) parts.push(operator);
  parts.push(`bill_type:${opts.billType}`, `tax_rate:${opts.taxRate}`);
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
  linkedClaimId,
  linkedLegalMatterId,
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
  const nextBillNumberQuery = useQuery({
    queryKey: ["accounting", "bills", "next-number", operatingCompanyId],
    queryFn: () => getNextBillDocumentNumber(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 15_000,
  });
  useEffect(() => {
    const preview = nextBillNumberQuery.data?.document_number?.trim();
    if (!preview) return;
    setBillNumber((prev) => (prev.trim() ? prev : preview));
  }, [nextBillNumberQuery.data?.document_number]);
  /** Operator memo / Gate-B sample tag — persisted at the front of `memo` (LV-SAMPLE-BILL-UNTAGGED). */
  const [operatorMemo, setOperatorMemo] = useState("");
  const [isSampleData, setIsSampleData] = useState(false);
  const [terms, setTerms] = useState("net_30");
  const [vendorId, setVendorId] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState(linkedUnitId ?? "");
  const [legalMatterId, setLegalMatterId] = useState(linkedLegalMatterId ?? "");
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
    if (!linkedLegalMatterId) return;
    setLegalMatterId((prev) => prev || linkedLegalMatterId);
  }, [linkedLegalMatterId]);

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
  const accountsQuery = useQuery({
    queryKey: ["vendor-bill-form", "ap-accounts", operatingCompanyId],
    // Entity-scoped CoA (never the user's default-company chart). listCatalogAccounts (not
    // getCoaAccounts) because its row shape carries is_postable — the A/P filter below needs it.
    // LST-F14: posting A/P picker — server-side is_postable=true (never header/non-postable).
    queryFn: () =>
      listCatalogAccounts({ status: "active", operating_company_id: operatingCompanyId, postable_only: true }),
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


  // A/P account picker — Liability / AccountsPayable postable accounts (canonical catalogs.accounts).
  const apAccountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        .filter((acct) => {
          // is_postable is REQUIRED here. Dropping it let non-postable Liability HEADER accounts into
          // the A/P picker — e.g. the "Driver Escrow" parent that driver-subaccount-provision creates
          // with is_postable=false. Selecting one persists a header id to accounting.bills.coa_account_id
          // and feeds it to the QBO bill push as the AP account.
          if (!acct.is_postable) return false;
          if (acct.deactivated_at) return false;
          const type = String(acct.account_type ?? "");
          const subtype = String(acct.account_subtype ?? "").toLowerCase();
          const name = String(acct.account_name ?? "").toLowerCase();
          return (
            type === "Liability" ||
            subtype.includes("payable") ||
            name.includes("accounts payable")
          );
        })
        .map((acct) => ({
          value: acct.id,
          label: acct.account_name,
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
    // ACCT-F93 (live 2026-08-02): this checked `!line.account_id`, but buildVendorBillLinePayloads
    // NEVER assigns account_id — the field is declared on VendorBillFormLinePayload and written
    // nowhere. So the test was unconditionally true and this error fired for EVERY Section-A line no
    // matter which category was picked: no vendor bill with a category line could ever be saved.
    //
    // It was reported as "the combobox does not commit". It does — CostBreakdownBox binds the choice
    // to expense_category_uuid correctly (which is why the identical picker works on a Work Order).
    // The validator was simply reading a different field than the one the grid writes.
    //
    // expense_category_uuid is the RIGHT field to require here. In bill mode the options come from
    // the catalogs.expense_categories CATALOG, so the id is a category uuid, not a GL account id; the
    // poster resolves the account from expense_category_account_map. vendorBillLines.ts says so
    // explicitly — "Unknown codes keep expense_category_uuid only (poster → uncategorized) — never
    // invent a GL account" — so populating account_id client-side would be the wrong fix and would
    // re-create the same-entity FK break that comment warns about.
    const sectionAMissingCategory = linePayloads.some(
      (line) => line.section === "A" && !String(line.expense_category_uuid ?? "").trim()
    );
    if (sectionAMissingCategory) {
      setFormError("Each Category (Section A) line needs an expense category.");
      return;
    }

    const resolvedUnitId = unitId || linkedUnitId || undefined;
    const resolvedLegalMatterId = legalMatterId || linkedLegalMatterId || undefined;

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
        operatorMemo,
      }),
      coa_account_id: accountId ?? undefined,
      attachment_draft_id: draftAttachmentEntityId,
      lines: linePayloads,
      // HARD cross-module FKs — only when linkage / picker supplies them.
      ...(linkedWoId ? { work_order_id: linkedWoId } : {}),
      ...(resolvedUnitId ? { unit_id: resolvedUnitId } : {}),
      ...(linkedClaimId ? { insurance_claim_id: linkedClaimId } : {}),
      ...(resolvedLegalMatterId ? { legal_matter_id: resolvedLegalMatterId } : {}),
      ...(classId ? { class_id: classId } : {}),
      is_sample_data: isSampleData,
    });
  }

  return (
    <>
    <form className="space-y-3" onSubmit={handleSubmit}>
      {linkedWoId && linkedWoDisplayId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
          Linked — <EntityLink kind="work_order" id={linkedWoId} label={entityLabel(linkedWoDisplayId, linkedWoId, "Work order")} />
        </div>
      ) : null}
      {linkedClaimId ? (
        <div
          className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700"
          data-testid="vendor-bill-linked-claim"
        >
          Linked claim — <EntityLink kind="claim" id={linkedClaimId} label={entityLabel(null, linkedClaimId, "Claim")} />
        </div>
      ) : null}
      {linkedLegalMatterId ? (
        <div
          className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700"
          data-testid="vendor-bill-linked-legal-matter"
        >
          Linked matter —{" "}
          <EntityLink
            kind="matter"
            id={linkedLegalMatterId}
            label={entityLabel(null, linkedLegalMatterId, "Matter")}
          />
        </div>
      ) : null}
      <TypeTabBar
        tabs={BILL_TYPE_TABS}
        activeId={billType}
        onChange={(tabId) => {
          if ((BILL_TYPE_TABS as readonly { id: BillTypeId }[]).some((t) => t.id === tabId)) {
            setBillType(tabId as BillTypeId);
          }
        }}
      />

      {/* QBO Bill chrome: first row after tabs — Vendor left, Bill no. flush top-right. */}
      <div className="flex w-full items-start gap-3" data-testid="qbo-bill-header">
        <div className="min-w-0 flex-1">
          <Field label="Vendor *">
            <>
              <ReferenceSelect
                value={vendorId || null}
                onChange={(next) => setVendorId(next ?? "")}
                options={vendorOptions}
                createKind="vendor"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select vendor..."
                disabled={!operatingCompanyId}
              />
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
        </div>
        <div className="ml-auto w-44 shrink-0 text-right">
          <Field label="Bill no.">
            <input
              aria-label="Bill no."
              data-testid="vendor-bill-number"
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-right text-xs"
              value={billNumber}
              onChange={(event) => setBillNumber(event.target.value)}
              placeholder={nextBillNumberQuery.isLoading ? "…" : "Assigned on save"}
            />
          </Field>
        </div>
      </div>

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
        <Field label="Memo">
          <input
            className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            value={operatorMemo}
            onChange={(event) => setOperatorMemo(event.target.value)}
            placeholder="Memo"
            data-testid="vendor-bill-operator-memo"
            aria-label="Memo"
          />
        </Field>
        <Field label="">
          {/* VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE — the ONLY UI path that sets
              accounting.bills.is_sample_data on create. Mirrors Book Load's `is_sample_data`
              checkbox (BookLoadModalV4.tsx). The JE poster already derives its own
              journal_entries.is_sample_data from this column (posting-engine.service.ts
              readSourceIsSampleData) — marking it here is the only wiring this needed. */}
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              data-testid="vendor-bill-is-sample-data"
              checked={isSampleData}
              onChange={(event) => setIsSampleData(event.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-gray-300"
            />
            Sample / demo bill
          </label>
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
            createKind="account"
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
          <EntityPicker
            kind="driver"
            operatingCompanyId={operatingCompanyId}
            value={driverId || null}
            onChange={(next) => setDriverId(next ?? "")}
            placeholder="Select driver..."
            nestedInDrawer={Boolean(linkedWoId)}
          />
        </Field>
        <Field label="Unit">
          <EntityPicker
            kind="unit"
            operatingCompanyId={operatingCompanyId}
            value={unitId || null}
            onChange={(next) => setUnitId(next ?? "")}
            placeholder="Select unit..."
            nestedInDrawer={Boolean(linkedWoId)}
          />
        </Field>
        <Field label="Legal matter">
          <EntityPicker
            kind="legal_matter"
            operatingCompanyId={operatingCompanyId}
            value={legalMatterId || null}
            onChange={(next) => setLegalMatterId(next ?? "")}
            placeholder="Select legal matter..."
            nestedInDrawer={Boolean(linkedWoId || linkedLegalMatterId)}
            dataTestId="vendor-bill-legal-matter-picker"
          />
        </Field>
        <div className="md:col-span-2" />
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
      <TotalsStack
        subtotal={subtotal}
        taxRate={taxRate}
        onTaxRateChange={setTaxRate}
        grandLabel="Bill Total = sum of lines"
        taxDisplayOnly
      />

      <div className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] text-slate-700">
        Line amounts post together with the bill header as one transaction. Tax shown above is
        display-only until a tax expense line with a real CoA
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
