import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createVendorBill } from "../../api/accounting";
import { ConfirmDiscardDialog } from "../../components/dialogs/ConfirmDiscardDialog";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { SaveDropdown } from "../../components/forms/SaveDropdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { PAGE_SHELL_CLASS } from "../../components/layout/pageShellClasses";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

function dollarsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type ExpFormSnap = {
  vendorId: string | null;
  vendorDisplay: string;
  accountHint: { qboId: string | null; name: string };
  billDate: string;
  amount: string;
};

const emptyHint = { qboId: null as string | null, name: "" };

export function ExpenseCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorDisplay, setVendorDisplay] = useState("");
  const [accountHint, setAccountHint] = useState(emptyHint);
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [baseline, setBaseline] = useState<ExpFormSnap | null>(null);
  const saveFollowRef = useRef<"default" | "add_another">("default");

  const memo = useMemo(() => {
    const parts = ["Expense capture (Phase 1 placeholder until dedicated expense API ships)"];
    if (accountHint.qboId) parts.push(`QBO account ${accountHint.qboId}: ${accountHint.name}`);
    return parts.join(" · ");
  }, [accountHint]);

  const formSnap = useMemo(
    (): ExpFormSnap => ({
      vendorId,
      vendorDisplay,
      accountHint,
      billDate,
      amount,
    }),
    [accountHint, amount, billDate, vendorDisplay, vendorId]
  );
  const { isDirty: formDirty } = useUnsavedChanges(formSnap, baseline ?? formSnap);

  useEffect(() => {
    const snap: ExpFormSnap = {
      vendorId: null,
      vendorDisplay: "",
      accountHint: emptyHint,
      billDate: new Date().toISOString().slice(0, 10),
      amount: "",
    };
    setBaseline(snap);
  }, []);

  const clearForm = useCallback(() => {
    setVendorId(null);
    setVendorDisplay("");
    setAccountHint(emptyHint);
    setBillDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setBaseline({
      vendorId: null,
      vendorDisplay: "",
      accountHint: emptyHint,
      billDate: new Date().toISOString().slice(0, 10),
      amount: "",
    });
  }, []);

  useEscapeKey(() => {
    if (!formDirty) return;
    setShowDiscard(true);
  }, formDirty);

  async function saveExpense() {
    if (!companyId) return pushToast("Select operating company first", "error");
    const vendorKey = (vendorId ?? vendorDisplay).trim();
    if (!vendorKey) return pushToast("Vendor is required", "error");
    const cents = dollarsToCents(amount);
    if (cents <= 0) return pushToast("Amount must be greater than zero", "error");

    setSubmitting(true);
    try {
      await createVendorBill(companyId, {
        vendor_id: vendorKey,
        bill_date: billDate,
        amount_cents: cents,
        memo,
      });
      pushToast("Expense recorded as vendor bill", "success");
      if (saveFollowRef.current === "add_another") {
        clearForm();
      } else {
        clearForm();
      }
    } catch (error) {
      pushToast(String((error as Error).message || "Failed to record expense"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={`${PAGE_SHELL_CLASS} space-y-4`}>
      <PageHeader title="Create expense" subtitle="Uses vendor bills API today with QuickBooks vendor + account reference fields." />
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <form
        className="mx-auto max-w-3xl space-y-3 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="text-xs font-semibold text-gray-700">
          Vendor
          <div className="mt-1">
            <QboCombobox
              entityType="vendor"
              operatingCompanyId={companyId}
              value={vendorId}
              displayValue={vendorDisplay}
              onChange={(qboId, displayName) => {
                setVendorId(qboId);
                setVendorDisplay(displayName);
              }}
            />
          </div>
        </label>

        <label className="text-xs font-semibold text-gray-700">
          Account (reference → memo)
          <div className="mt-1">
            <QboCombobox
              entityType="account"
              operatingCompanyId={companyId}
              value={accountHint.qboId}
              displayValue={accountHint.name}
              onChange={(qboId, displayName) => setAccountHint({ qboId, name: displayName })}
            />
          </div>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700">
            Expense date
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Amount (USD)
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <SaveDropdown
            storageKey="expense-create"
            primaryLabel="Save"
            disabled={!companyId}
            loading={submitting}
            onSave={() => {
              saveFollowRef.current = "default";
              void saveExpense();
            }}
            onSaveAndClose={() => {
              saveFollowRef.current = "default";
              void saveExpense();
            }}
            onSaveAndAddAnother={() => {
              saveFollowRef.current = "add_another";
              void saveExpense();
            }}
          />
        </div>
      </form>
      <ConfirmDiscardDialog
        open={showDiscard}
        onCancel={() => setShowDiscard(false)}
        onDiscard={() => {
          setShowDiscard(false);
          clearForm();
        }}
      />
    </div>
  );
}
