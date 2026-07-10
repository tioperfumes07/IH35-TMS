import type { JSX } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers, listUnits, listVendors } from "../../../api/mdata";
import { getWoCostContext } from "../../../api/maintenance";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import { createExpense } from "../../../api/accounting";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";
import { companyToday } from "../../../lib/businessDate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { EXPENSE_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  /** When present, the created expense's memo carries this WO reference (human-readable maintenance linkage). */
  linkedWoDisplayId?: string;
  /** When present, the created expense persists a HARD FK (accounting.expenses.work_order_id) to this WO. */
  linkedWoId?: string;
  /** When present (WO context), the created expense persists a HARD FK to this unit. Falls back to the picker. */
  linkedUnitId?: string;
  onClose: () => void;
  onCreated?: (expenseId: string | null) => void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function CreateExpenseModal({ open, operatingCompanyId, linkedWoDisplayId, linkedWoId, linkedUnitId, onClose, onCreated }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [expenseType, setExpenseType] = useState("fuel");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [expenseDate, setExpenseDate] = useState(() => companyToday());
  const [expenseNumber, setExpenseNumber] = useState("");
  const [categoryQboId, setCategoryQboId] = useState<string | null>(null);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [payFromAccountId, setPayFromAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("fuel_card");
  const [payeeId, setPayeeId] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [className, setClassName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  // Payment account = the cash/bank asset the expense was paid FROM. Sourced from the postable Asset
  // chart of accounts (catalogs.accounts) so the id is a valid payment_account_uuid — same source the
  // canonical Record-Expense form uses.
  const paymentAccountsQuery = useQuery({
    queryKey: ["create-expense-modal", "payment-accounts", operatingCompanyId],
    queryFn: () => listCatalogAccounts({ status: "active" }),
    enabled: Boolean(open && operatingCompanyId),
    staleTime: 60_000,
  });
  const costContextQuery = useQuery({
    queryKey: ["create-expense-modal", "cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(open && operatingCompanyId),
    staleTime: 60_000,
  });
  const vendorsQuery = useQuery({
    queryKey: ["create-expense-modal", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["create-expense-modal", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId, limit: 200 }), // full active set (endpoint default 50 truncates >50)
    enabled: Boolean(open && operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["create-expense-modal", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });

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
  const payeeOptions = useMemo(
    () =>
      (vendorsQuery.data?.vendors ?? []).map((vendor) => ({
        value: vendor.id,
        label: vendor.name,
      })),
    [vendorsQuery.data?.vendors]
  );
  const subtotal = lines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);
  const totalCents = Math.round((subtotal + (subtotal * taxRate) / 100) * 100);

  // Fold the maintenance context (unit / driver / load / class / payment / invoice) into the expense memo
  // so the cash-out is CONNECTED even though the canonical expense create has no WO/unit FK column.
  function buildMemo(): string | undefined {
    const parts: string[] = [];
    const typeLabel = EXPENSE_TYPE_TABS.find((t) => t.id === expenseType)?.label;
    if (typeLabel) parts.push(typeLabel);
    if (linkedWoDisplayId) parts.push(`WO: ${linkedWoDisplayId}`);
    if (categoryLabel) parts.push(`Category: ${categoryLabel}`);
    if (expenseNumber.trim()) parts.push(`Expense #: ${expenseNumber.trim()}`);
    if (invoiceNumber.trim()) parts.push(`Invoice: ${invoiceNumber.trim()}`);
    if (loadNumber.trim()) parts.push(`Load: ${loadNumber.trim()}`);
    if (driverId) {
      const d = (driversQuery.data?.drivers ?? []).find((row) => row.id === driverId);
      const name = d ? [d.first_name, d.last_name].filter(Boolean).join(" ").trim() : "";
      if (name) parts.push(`Driver: ${name}`);
    }
    if (unitId) {
      const u = ((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).find((row) => String(row.id ?? "") === unitId);
      const label = u ? String(u.unit_number ?? u.id ?? "") : "";
      if (label) parts.push(`Unit: ${label}`);
    }
    if (className.trim()) parts.push(`Class: ${className.trim()}`);
    if (paymentMethod) parts.push(`Payment: ${paymentMethod.replace(/_/g, " ").toUpperCase()}`);
    return parts.length ? parts.join(" · ") : undefined;
  }

  const createMutation = useMutation({
    mutationFn: () => {
      if (!operatingCompanyId) throw new Error("Select an operating company first");
      if (!categoryQboId) throw new Error("Category is required");
      if (!payFromAccountId) throw new Error("Pay-from account is required");
      if (totalCents <= 0) throw new Error("Expense total must be greater than zero");
      return createExpense(operatingCompanyId, {
        category_qbo_id: categoryQboId,
        expense_date: expenseDate,
        amount_cents: totalCents,
        payment_account_uuid: payFromAccountId,
        memo: buildMemo(),
        ...(payeeId && UUID_RE.test(payeeId) ? { vendor_uuid: payeeId } : {}),
        // HARD cross-module link: persist the WO + unit as real FKs (forward half of the bidirectional
        // link; reverse half = WO detail "Linked Bills / Expenses"). Unit picker overrides the WO's unit.
        ...(linkedWoId ? { work_order_id: linkedWoId } : {}),
        ...(unitId || linkedUnitId ? { unit_id: unitId || linkedUnitId } : {}),
        attachment_draft_id: draftAttachmentEntityId,
      });
    },
    onSuccess: (res) => {
      pushToast("Expense recorded", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "expenses"] });
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      onCreated?.(res?.expense_id ?? null);
      onClose();
    },
    onError: (error) => {
      pushToast(String((error as Error).message || "Failed to record expense"), "error");
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Create Expense">
      <div className="space-y-3">
        <TypeTabBar tabs={EXPENSE_TYPE_TABS} activeId={expenseType} onChange={setExpenseType} />

        <div className="rounded-sm border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Expense Details
        </div>

        <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-2 md:grid-cols-6">
          <Field label="Expense Type *">
            <input className="h-8 w-full rounded-sm border border-gray-300 bg-gray-100 px-2 text-xs" value={EXPENSE_TYPE_TABS.find((tab) => tab.id === expenseType)?.label ?? "Fuel Expense"} readOnly />
          </Field>
          <Field label="Expense Date">
            <DatePicker className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={expenseDate} onChange={setExpenseDate} />
          </Field>
          <Field label="Expense Number">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Expense Number" value={expenseNumber} onChange={(event) => setExpenseNumber(event.target.value)} />
          </Field>
          <Field label="Category *">
            <SelectCombobox
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
              value={categoryOptions.find((row) => row.qboId === categoryQboId)?.id ?? ""}
              onChange={(event) => {
                const match = categoryOptions.find((row) => row.id === event.target.value);
                setCategoryQboId(match?.qboId ?? null);
                setCategoryLabel(match?.label ?? "");
              }}
            >
              <option value="">Select category...</option>
              {categoryOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <div className="md:col-span-2" />

          <Field label="Pay From Account *">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={payFromAccountId} onChange={(event) => setPayFromAccountId(event.target.value)}>
              <option value="">Select account...</option>
              {paymentAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Payment Method">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="fuel_card">Fuel card</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
            </SelectCombobox>
          </Field>
          <div className="md:col-span-4" />

          <div className="md:col-span-6 h-2" />
          <Field label="Payee">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={payeeId} onChange={(event) => setPayeeId(event.target.value)}>
              <option value="">Select payee...</option>
              {payeeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <div className="md:col-span-4" />
          <Field label="Load Number">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Load Number" value={loadNumber} onChange={(event) => setLoadNumber(event.target.value)} />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Select driver...</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Unit Number">
            <SelectCombobox className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
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
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class" />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Invoice Number">
            <input className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" placeholder="Invoice Number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
          </Field>
          <div className="md:col-span-5" />
        </div>

        <TwoSectionLineEditor mode="expense" onChange={setLines} partsLaborMode="parts-and-labor" />
        <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Expense Total = A + B" />
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="expense"
          entityId={draftAttachmentEntityId}
          defaultCategory="receipt"
          title="Expense Receipts"
        />

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="secondary" type="button" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            data-testid="create-expense-submit"
            loading={createMutation.isPending}
            disabled={createMutation.isPending || !categoryQboId || !payFromAccountId || totalCents <= 0}
            onClick={() => createMutation.mutate()}
          >
            Create Expense
          </Button>
        </div>
      </div>
    </Modal>
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
