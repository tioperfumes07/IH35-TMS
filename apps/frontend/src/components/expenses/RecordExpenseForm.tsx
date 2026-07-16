import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWoCostContext } from "../../api/maintenance";
import { listUnits, listVendors } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { SelectCombobox } from "../shared/SelectCombobox";
import { UploadZone } from "../UploadZone";
import {
  initialRecordExpenseFormValues,
  RECORD_EXPENSE_PAYMENT_METHODS,
  submitRecordExpense,
  type RecordExpenseFormValues,
} from "./recordExpenseSubmit";

type Props = {
  operatingCompanyId: string;
  // Passes the created expense id so callers can offer transaction-side task completion (non-posting).
  onSubmitted?: (created?: { targetType: "expense"; targetId: string }) => void;
  showSubmitButton?: boolean;
  submitLabel?: string;
  /** Optional test id on the primary submit button (maintenance modal reuse). */
  submitTestId?: string;
  idPrefix?: string;
  /**
   * Optional HARD FK to maintenance.work_orders — when set, createExpense payload includes
   * work_order_id. Absent → default accounting create (non-breaking).
   */
  workOrderId?: string;
  /** Optional WO-context unit prefill + unit_id fallback when the picker is empty. */
  defaultUnitId?: string;
  /** Human-readable WO id for memo + banner (maintenance linkage). */
  linkedWoDisplayId?: string;
};

export function RecordExpenseForm({
  operatingCompanyId,
  onSubmitted,
  showSubmitButton = true,
  submitLabel = "Save expense",
  submitTestId,
  idPrefix = "record-expense",
  workOrderId,
  defaultUnitId,
  linkedWoDisplayId,
}: Props) {
  const [values, setValues] = useState<RecordExpenseFormValues>(() => {
    const initial = initialRecordExpenseFormValues();
    return defaultUnitId ? { ...initial, unitId: defaultUnitId } : initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());

  // Prefill unit from WO context without clobbering a user picker change.
  useEffect(() => {
    if (!defaultUnitId) return;
    setValues((prev) => (prev.unitId ? prev : { ...prev, unitId: defaultUnitId }));
  }, [defaultUnitId]);

  const costContextQuery = useQuery({
    queryKey: ["record-expense", "cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const unitsQuery = useQuery({
    queryKey: ["record-expense", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId, limit: 500 }),
    enabled: Boolean(operatingCompanyId),
  });
  const vendorsQuery = useQuery({
    queryKey: ["record-expense", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, limit: 500 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const paymentAccountsQuery = useQuery({
    queryKey: ["record-expense", "payment-accounts", operatingCompanyId],
    // No explicit limit → listCatalogAccounts pages through the FULL chart (backend caps limit at 200; the
    // chart has 371 accounts), so the oldest payment accounts stay selectable (G9-H6).
    queryFn: () => listCatalogAccounts({ status: "active" }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  // Vendor options from the CANONICAL mdata.vendors roster (same table the inline "+ Add new vendor"
  // QuickCreate writes to) so a created vendor selects + survives reload (QB-STD-5).
  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map((v) => ({ value: v.id, label: v.name })),
    [vendorsQuery.data?.vendors]
  );

  // Payment account = the cash/bank account the expense was paid FROM → postable Asset accounts.
  const paymentAccountOptions = useMemo(
    () =>
      (paymentAccountsQuery.data?.accounts ?? [])
        .filter((acct) => acct.is_postable && acct.account_type === "Asset" && !acct.deactivated_at)
        .map((acct) => ({
          id: acct.id,
          label: acct.account_number ? `${acct.account_number} · ${acct.account_name}` : acct.account_name,
        })),
    [paymentAccountsQuery.data?.accounts]
  );

  // LIVE-DEFECT fix (GUARD 2026-07-12): surface the FULL Chart-of-Accounts as Category options (same COA the
  // banking categorize screen uses) instead of the limited/empty expense_categories list. paymentAccountsQuery
  // already fetches the full chart; filter to postable accounts that carry a QBO id (category_qbo_id is REQUIRED
  // to post). Fallback to expense_categories only if the COA query hasn't resolved.
  const categoryOptions = useMemo(() => {
    const fromCoa = (paymentAccountsQuery.data?.accounts ?? [])
      .filter((acct) => acct.is_postable && acct.qbo_account_id)
      .map((acct) => ({
        id: String(acct.id),
        label: acct.account_number ? `${acct.account_number} · ${acct.account_name}` : acct.account_name,
        qboId: acct.qbo_account_id,
      }));
    if (fromCoa.length > 0) return fromCoa;
    return (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
      qboId: entry.qbo_id ? String(entry.qbo_id) : null,
    }));
  }, [paymentAccountsQuery.data?.accounts, costContextQuery.data?.expense_categories]);

  // Resolve unit label for memo when WO context prefills unitId before the user touches the picker.
  useEffect(() => {
    if (!values.unitId || values.unitLabel) return;
    const units = (unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>;
    const match = units.find((row) => String(row.id ?? "") === values.unitId);
    if (!match) return;
    setValues((prev) => ({
      ...prev,
      unitLabel: String(match.unit_number ?? match.id ?? ""),
    }));
  }, [values.unitId, values.unitLabel, unitsQuery.data?.units]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!operatingCompanyId) {
      setError("Select operating company first");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await submitRecordExpense(operatingCompanyId, values, draftAttachmentEntityId, {
        workOrderId,
        unitId: defaultUnitId,
        linkedWoDisplayId,
      });
      const reset = initialRecordExpenseFormValues();
      setValues(defaultUnitId ? { ...reset, unitId: defaultUnitId } : reset);
      setDraftAttachmentEntityId(crypto.randomUUID());
      onSubmitted?.(created?.expense_id ? { targetType: "expense", targetId: created.expense_id } : undefined);
    } catch (submitError) {
      setError(String((submitError as Error).message || "Failed to record expense"));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldId = (name: string) => `${idPrefix}-${name}`;

  return (
    <form className="space-y-3" onSubmit={onSubmit} data-testid="record-expense-form">
      {linkedWoDisplayId ? (
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Linked — {linkedWoDisplayId}
        </div>
      ) : null}
      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("vendor")}>
        Vendor
        <div className="mt-1">
          {/* Shared ReferenceSelect gives Vendor the inline "+ Add new vendor" first row (QuickCreate →
              canonical mdata.vendors), matching Category. The submit sends vendor_uuid (canonical id) only;
              a freshly created vendor selects + persists (survives reload). No free-text-only picker. */}
          <ReferenceSelect
            value={values.vendorUuid || null}
            onChange={(next) => {
              if (!next) {
                setValues((prev) => ({ ...prev, vendorUuid: null, vendorId: null, vendorDisplay: "" }));
                return;
              }
              const match = vendorOptions.find((row) => row.value === next);
              // A just-created vendor isn't in vendorOptions yet — onOptionCreated set the values already,
              // so don't clobber when there's no match.
              if (!match) return;
              setValues((prev) => ({ ...prev, vendorUuid: next, vendorId: null, vendorDisplay: match.label }));
            }}
            options={vendorOptions}
            createKind="vendor"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select vendor…"
            onOptionCreated={(opt) => {
              setValues((prev) => ({ ...prev, vendorUuid: opt.value, vendorId: null, vendorDisplay: opt.label }));
              void vendorsQuery.refetch();
            }}
          />
        </div>
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("category")}>
        Category
        <div className="mt-1">
          {/* Doc-19-B: shared ReferenceSelect gives the Category picker the inline "+ Add new category"
              first row (full COA wizard → canonical catalogs.accounts), matching Bills / the split modal
              (FIX-02). Existing categories map their QBO account id (category_qbo_id) on select; a freshly
              created local category selects + persists to catalogs.accounts (survives reload in the CoA). */}
          <ReferenceSelect
            value={values.categoryId || null}
            onChange={(next) => {
              if (!next) {
                setValues((prev) => ({ ...prev, categoryId: "", categoryLabel: "", categoryQboId: null }));
                return;
              }
              const match = categoryOptions.find((row) => row.id === next);
              // A just-created category isn't in categoryOptions yet — onOptionCreated already set the
              // values for it, so don't clobber when there's no match.
              if (!match) return;
              setValues((prev) => ({
                ...prev,
                categoryId: next,
                categoryLabel: match.label,
                categoryQboId: match.qboId,
              }));
            }}
            options={categoryOptions.map((row) => ({ value: row.id, label: row.label }))}
            createKind="category"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select category…"
            onOptionCreated={(opt) => {
              setValues((prev) => ({ ...prev, categoryId: opt.value, categoryLabel: opt.label, categoryQboId: null }));
              void costContextQuery.refetch();
            }}
          />
        </div>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("date")}>
          {/* QBO-parity: "Payment Date" (B8 §1 live capture) — same billDate state, no payload change. */}
          Payment Date
          <DatePicker
            id={fieldId("date")}
            className="mt-1 w-full"
            value={values.billDate}
            onChange={(next) => setValues((prev) => ({ ...prev, billDate: next }))}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("amount")}>
          Amount (USD)
          {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents byte-for-byte. */}
          <MoneyInput
            id={fieldId("amount")}
            valueDollars={values.amount}
            onChangeDollars={(d) => setValues((prev) => ({ ...prev, amount: d }))}
            ariaLabel="Amount (USD)"
            className="mt-1 w-full"
          />
        </label>
      </div>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("unit")}>
        Truck/Unit (optional)
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("unit")}
            className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={values.unitId}
            onChange={(event) => {
              const nextId = event.target.value;
              const units = (unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>;
              const match = units.find((row) => String(row.id ?? "") === nextId);
              setValues((prev) => ({
                ...prev,
                unitId: nextId,
                unitLabel: match ? String(match.unit_number ?? match.id ?? "") : "",
              }));
            }}
          >
            <option value="">Select unit…</option>
            {((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((unit) => (
              <option key={String(unit.id ?? "")} value={String(unit.id ?? "")}>
                {String(unit.unit_number ?? unit.id ?? "")}
              </option>
            ))}
          </SelectCombobox>
        </div>
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("description")}>
        Description
        <input
          id={fieldId("description")}
          className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          value={values.description}
          onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("payment-method")}>
        Payment method
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("payment-method")}
            className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={values.paymentMethod}
            onChange={(event) =>
              setValues((prev) => ({
                ...prev,
                paymentMethod: event.target.value as RecordExpenseFormValues["paymentMethod"],
              }))
            }
          >
            <option value="">Select method…</option>
            {RECORD_EXPENSE_PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("payment-account")}>
        Payment account *
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("payment-account")}
            className="h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            value={values.paymentAccountId}
            onChange={(event) => {
              const nextId = event.target.value;
              const match = paymentAccountOptions.find((row) => row.id === nextId);
              setValues((prev) => ({ ...prev, paymentAccountId: nextId, paymentAccountLabel: match?.label ?? "" }));
            }}
          >
            <option value="">Select bank/cash account…</option>
            {paymentAccountOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
      </label>

      <div>
        <div className="mb-1 text-xs font-semibold text-gray-700">Receipts &amp; documents</div>
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="expense"
          entityId={draftAttachmentEntityId}
          defaultCategory="vendor_invoice"
          title="Supporting Documents"
        />
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {showSubmitButton ? (
        <div className="flex justify-end">
          <Button
            type="submit"
            data-testid={submitTestId}
            disabled={submitting || !operatingCompanyId}
          >
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
