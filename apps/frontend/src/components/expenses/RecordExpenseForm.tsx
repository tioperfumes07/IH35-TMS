import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWoCostContext } from "../../api/maintenance";
import { ensureDriverVendors, listVendors } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
// ACCT-F92: one definition of which accounts may appear in which picker — see account-picker-scope.ts
// for the live evidence (Accumulated Depreciation / Trucks / Prepaid / A/R are all account_type Asset).
import { isExpenseAccount, isPaymentAccount } from "../../lib/account-picker-scope";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { EntityPicker } from "../parity/EntityPicker";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { coaAccountReferenceOption, vendorReferenceOption } from "../parity/referenceOptionLabels";
import { SelectCombobox } from "../shared/SelectCombobox";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
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
  const vendorsQuery = useQuery({
    queryKey: ["record-expense", "vendors", operatingCompanyId],
    queryFn: async () => {
      // Ensure Active drivers exist as mdata.vendors (driver-as-vendor) before listing — a driver
      // payee must be selectable here, same as the Bill vendor picker.
      try {
        await ensureDriverVendors(operatingCompanyId);
      } catch {
        // Read path still works if ensure is forbidden for the role — picker shows existing vendors.
      }
      return listVendors({ operating_company_id: operatingCompanyId, limit: 5000, status: "active" });
    },
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const paymentAccountsQuery = useQuery({
    queryKey: ["record-expense", "payment-accounts", operatingCompanyId],
    // Entity-scoped full chart (USMCA/TRANSP) — never default-company CoA. No explicit limit so
    // listCatalogAccounts pages the FULL chart (backend caps limit at 200; the chart has 371),
    // keeping the oldest payment accounts selectable (G9-H6).
    // LST-F14: server-side is_postable filter (client filter remains defense-in-depth).
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  // Vendor options from the CANONICAL mdata.vendors roster (same table the inline "+ Add new vendor"
  // QuickCreate writes to) so a created vendor selects + survives reload (QB-STD-5).
  const vendorOptions = useMemo(
    () => (vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption),
    [vendorsQuery.data?.vendors]
  );

  // Unit picker — EntityPicker kind=unit (canonical mdata.units roster + inline create).
  // Payment account = the cash/bank account the expense was paid FROM.
  // ACCT-F92: this previously filtered on `account_type === "Asset"`, which on prod also admits
  // Accumulated Depreciation, Trucks & Tractors, Trailers, Prepaid Expenses, Inventory, A/R, Unbilled
  // Revenue, Factoring Reserves, Driver Cash Advances and the Inter-company accounts — so an expense
  // could be recorded as paid FROM depreciation. Now scoped to Bank/Credit-Card types and cash-like
  // detail types, matching how QuickBooks scopes its Expense "Payment account" field.
  const paymentAccountOptions = useMemo(
    () =>
      (paymentAccountsQuery.data?.accounts ?? [])
        .filter(isPaymentAccount)
        .map((acct) => ({
          id: acct.id,
          label: acct.account_name,
        })),
    [paymentAccountsQuery.data?.accounts]
  );

  // LIVE-DEFECT fix (2026-07-22): Category must list the entity CoA including freshly created accounts
  // that have no QBO bridge yet (parallel books). Previously filtered to qbo_account_id only → diesel
  // created via + Add new never appeared. Prefer Expense/COGS/OtherExpense; keep Income out of category.
  // ACCT-F92: this filter was already CORRECT — it is the model the payment picker now follows. Moved
  // to the shared helper so the two cannot drift apart again.
  const categoryOptions = useMemo(() => {
    const fromCoa = (paymentAccountsQuery.data?.accounts ?? [])
      .filter(isExpenseAccount)
      .map((acct) => ({
        id: String(acct.id),
        label: acct.account_name,
        qboId: acct.qbo_account_id,
      }));
    if (fromCoa.length > 0) return fromCoa;
    return (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
      qboId: entry.qbo_id ? String(entry.qbo_id) : null,
    }));
  }, [paymentAccountsQuery.data?.accounts, costContextQuery.data?.expense_categories]);

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
      {workOrderId && linkedWoDisplayId ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700">
          Linked — <EntityLink kind="work_order" id={workOrderId} label={entityLabel(linkedWoDisplayId, workOrderId, "Work order")} />
        </div>
      ) : null}
      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("vendor")}>
        Vendor
        <div className="mt-1">
          {/* Shared ReferenceSelect gives Vendor the inline "+ Add new vendor" first row (QuickCreate →
              canonical mdata.vendors), matching Category. The submit sends vendor_uuid (canonical id) only;
              a freshly created vendor selects + persists (survives reload). No free-text-only picker. */}
          <ReferenceSelect
            id={fieldId("vendor")}
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
          {/* C1-A11Y: the label above uses htmlFor={fieldId("category")}; without this id the label bound
              to nothing — unlabelled for screen readers, and getByLabelText addressed the wrong element. */}
          <ReferenceSelect
            id={fieldId("category")}
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
            options={categoryOptions.map((row) => {
              const account = (paymentAccountsQuery.data?.accounts ?? []).find((a) => String(a.id) === row.id);
              return account
                ? coaAccountReferenceOption(account)
                : { value: row.id, label: row.label };
            })}
            createKind="category"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select category…"
            // LV-EXPENSE-CATEGORY-PICKER-EMPTY-RC: without loading, an open dropdown during CoA fetch
            // shows ONLY "+ Add new category" (Combobox hides options until data arrives) — operators
            // then mint duplicate expense accounts. Payment already had disabled=; category had neither.
            // Combobox suppresses allowAddNew while loading=true, so the corruption path cannot fire.
            loading={paymentAccountsQuery.isLoading || paymentAccountsQuery.isFetching}
            disabled={!operatingCompanyId}
            onOptionCreated={(opt) => {
              setValues((prev) => ({
                ...prev,
                categoryId: opt.value,
                categoryLabel: opt.label,
                categoryQboId: null,
              }));
              void paymentAccountsQuery.refetch();
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
          <EntityPicker
            kind="unit"
            operatingCompanyId={operatingCompanyId}
            value={values.unitId || null}
            onChange={(next) =>
              setValues((prev) => ({
                ...prev,
                unitId: next ?? "",
                unitLabel: next ?? "",
              }))
            }
            placeholder="Select unit…"
            dataField={fieldId("unit")}
            dataTestId={fieldId("unit")}
          />
        </div>
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("load")}>
        Trip / Load {/(?:fuel|diesel|gas|roadside|ifta)/i.test(values.categoryLabel) ? "*" : "(optional)"}
        <div className="mt-1">
          <EntityPicker
            kind="load"
            operatingCompanyId={operatingCompanyId}
            value={values.loadId || null}
            onChange={(next) =>
              setValues((prev) => ({
                ...prev,
                loadId: next ?? "",
                loadLabel: next ?? "",
              }))
            }
            placeholder="Search trip / load…"
            dataField={fieldId("load")}
            dataTestId={fieldId("load")}
            allowClear
          />
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
        Payment method *
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
          <ReferenceSelect
            id={fieldId("payment-account")}
            value={values.paymentAccountId || null}
            onChange={(next) => {
              const match = paymentAccountOptions.find((row) => row.id === (next ?? ""));
              setValues((prev) => ({
                ...prev,
                paymentAccountId: next ?? "",
                paymentAccountLabel: match?.label ?? "",
              }));
            }}
            options={paymentAccountOptions.map((row) => ({ value: row.id, label: row.label }))}
            createKind="account"
            addNewLabel="+ Add new account"
            operatingCompanyId={operatingCompanyId}
            placeholder="Select bank/cash account…"
            disabled={!operatingCompanyId}
          />
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
