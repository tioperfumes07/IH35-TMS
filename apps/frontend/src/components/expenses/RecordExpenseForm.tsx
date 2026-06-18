import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWoCostContext } from "../../api/maintenance";
import { listUnits } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { Button } from "../Button";
import { QboCombobox } from "../forms/QboCombobox";
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
  onSubmitted?: () => void;
  showSubmitButton?: boolean;
  submitLabel?: string;
  idPrefix?: string;
};

export function RecordExpenseForm({
  operatingCompanyId,
  onSubmitted,
  showSubmitButton = true,
  submitLabel = "Save expense",
  idPrefix = "record-expense",
}: Props) {
  const [values, setValues] = useState<RecordExpenseFormValues>(initialRecordExpenseFormValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState(() => crypto.randomUUID());

  const costContextQuery = useQuery({
    queryKey: ["record-expense", "cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const unitsQuery = useQuery({
    queryKey: ["record-expense", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(operatingCompanyId),
  });
  const paymentAccountsQuery = useQuery({
    queryKey: ["record-expense", "payment-accounts", operatingCompanyId],
    queryFn: () => listCatalogAccounts({ status: "active", limit: 300 }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

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

  const categoryOptions = useMemo(
    () =>
      (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.name ?? ""),
        qboId: entry.qbo_id ? String(entry.qbo_id) : null,
      })),
    [costContextQuery.data?.expense_categories]
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!operatingCompanyId) {
      setError("Select operating company first");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitRecordExpense(operatingCompanyId, values, draftAttachmentEntityId);
      setValues(initialRecordExpenseFormValues());
      setDraftAttachmentEntityId(crypto.randomUUID());
      onSubmitted?.();
    } catch (submitError) {
      setError(String((submitError as Error).message || "Failed to record expense"));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldId = (name: string) => `${idPrefix}-${name}`;

  return (
    <form className="space-y-3" onSubmit={onSubmit} data-testid="record-expense-form">
      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("vendor")}>
        Vendor
        <div className="mt-1">
          <QboCombobox
            entityType="vendor"
            operatingCompanyId={operatingCompanyId}
            value={values.vendorId}
            displayValue={values.vendorDisplay}
            onChange={(qboId, displayName) => {
              setValues((prev) => ({ ...prev, vendorId: qboId, vendorDisplay: displayName, vendorUuid: null }));
            }}
            onPick={(row) => {
              setValues((prev) => ({ ...prev, vendorId: row.qbo_id, vendorUuid: row.id, vendorDisplay: row.display_name }));
            }}
          />
        </div>
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("category")}>
        Category
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("category")}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            value={values.categoryId}
            onChange={(event) => {
              const nextId = event.target.value;
              const match = categoryOptions.find((row) => row.id === nextId);
              setValues((prev) => ({
                ...prev,
                categoryId: nextId,
                categoryLabel: match?.label ?? "",
                categoryQboId: match?.qboId ?? null,
              }));
            }}
          >
            <option value="">Select category…</option>
            {categoryOptions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </SelectCombobox>
        </div>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("date")}>
          Date
          <input
            id={fieldId("date")}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
            type="date"
            value={values.billDate}
            onChange={(event) => setValues((prev) => ({ ...prev, billDate: event.target.value }))}
          />
        </label>
        <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("amount")}>
          Amount (USD)
          <input
            id={fieldId("amount")}
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
            inputMode="decimal"
            value={values.amount}
            onChange={(event) => setValues((prev) => ({ ...prev, amount: event.target.value }))}
          />
        </label>
      </div>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("unit")}>
        Truck/Unit (optional)
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("unit")}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
          className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          value={values.description}
          onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>

      <label className="text-xs font-semibold text-gray-700" htmlFor={fieldId("payment-method")}>
        Payment method
        <div className="mt-1">
          <SelectCombobox
            id={fieldId("payment-method")}
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
            className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
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
          <Button type="submit" disabled={submitting || !operatingCompanyId}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
