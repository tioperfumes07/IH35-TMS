import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers, listUnits, listVendors } from "../../../api/mdata";
import { getAllAccounts } from "../../../api/banking";
import { Modal } from "../../../components/Modal";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
import { EXPENSE_TYPE_TABS, TypeTabBar } from "../../../components/forms/shared/TypeTabBar";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { UploadZone } from "../../../components/UploadZone";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
};

export function CreateExpenseModal({ open, operatingCompanyId, onClose }: Props) {
  const [lines, setLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  const [expenseType, setExpenseType] = useState("fuel");
  const [draftAttachmentEntityId] = useState(() => crypto.randomUUID());
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseNumber, setExpenseNumber] = useState("");
  const [payFromAccountId, setPayFromAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("fuel_card");
  const [payeeId, setPayeeId] = useState("");
  const [loadNumber, setLoadNumber] = useState("");
  const [driverId, setDriverId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [className, setClassName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["create-expense-modal", "accounts", operatingCompanyId],
    queryFn: () => getAllAccounts(operatingCompanyId),
    enabled: Boolean(open && operatingCompanyId),
  });
  const vendorsQuery = useQuery({
    queryKey: ["create-expense-modal", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
  const driversQuery = useQuery({
    queryKey: ["create-expense-modal", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
  const unitsQuery = useQuery({
    queryKey: ["create-expense-modal", "units", operatingCompanyId],
    queryFn: () => listUnits({ status: "Active", operating_company_id: operatingCompanyId }),
    enabled: Boolean(open && operatingCompanyId),
  });
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

  return (
    <Modal open={open} onClose={onClose} title="Create Expense">
      <div className="space-y-3">
        <TypeTabBar tabs={EXPENSE_TYPE_TABS} activeId={expenseType} onChange={setExpenseType} />

        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          Expense Details
        </div>

        <div className="grid gap-2 rounded border border-gray-200 bg-white p-2 md:grid-cols-6">
          <Field label="Expense Type *">
            <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2 text-xs" value={EXPENSE_TYPE_TABS.find((tab) => tab.id === expenseType)?.label ?? "Fuel Expense"} readOnly />
          </Field>
          <Field label="Expense Date">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          </Field>
          <Field label="Expense Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Expense Number" value={expenseNumber} onChange={(event) => setExpenseNumber(event.target.value)} />
          </Field>
          <div className="md:col-span-3" />

          <Field label="Pay From Account">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={payFromAccountId} onChange={(event) => setPayFromAccountId(event.target.value)}>
              <option value="">Select account...</option>
              {(accountsQuery.data?.accounts ?? []).map((account) => (
                <option key={String(account.id ?? "")} value={String(account.id ?? "")}>
                  {String(account.display_name ?? "Account")}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Payment Method">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="fuel_card">Fuel card</option>
              <option value="debit">Debit</option>
              <option value="credit">Credit</option>
              <option value="cash">Cash</option>
            </SelectCombobox>
          </Field>
          <div className="md:col-span-4" />

          <div className="md:col-span-6 h-2" />
          <Field label="Payee">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={payeeId} onChange={(event) => setPayeeId(event.target.value)}>
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
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Load Number" value={loadNumber} onChange={(event) => setLoadNumber(event.target.value)} />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Driver">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">Select driver...</option>
              {(driversQuery.data?.drivers ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {[driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id}
                </option>
              ))}
            </SelectCombobox>
          </Field>
          <Field label="Unit Number">
            <SelectCombobox className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={unitId} onChange={(event) => setUnitId(event.target.value)}>
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
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class" />
          </Field>

          <div className="md:col-span-6 h-2" />
          <Field label="Invoice Number">
            <input className="h-8 w-full rounded border border-gray-300 px-2 text-xs" placeholder="Invoice Number" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} />
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
