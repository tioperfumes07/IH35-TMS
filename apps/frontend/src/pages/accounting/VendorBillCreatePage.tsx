import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createVendorBill } from "../../api/accounting";
import { ConfirmDiscardDialog } from "../../components/dialogs/ConfirmDiscardDialog";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { SaveDropdown } from "../../components/forms/SaveDropdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";

function dollarsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type BillFormSnap = {
  vendorId: string | null;
  vendorDisplay: string;
  itemHint: { qboId: string | null; name: string };
  accountHint: { qboId: string | null; name: string };
  billDate: string;
  dueDate: string;
  amount: string;
  billNumber: string;
};

const emptyHints = { qboId: null as string | null, name: "" };

export function VendorBillCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorDisplay, setVendorDisplay] = useState("");
  const [itemHint, setItemHint] = useState(emptyHints);
  const [accountHint, setAccountHint] = useState(emptyHints);
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [amount, setAmount] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [baseline, setBaseline] = useState<BillFormSnap | null>(null);
  const saveFollowRef = useRef<"default" | "add_another" | "print">("default");

  const memo = useMemo(() => {
    const parts: string[] = [];
    if (itemHint.qboId) parts.push(`QBO item ${itemHint.qboId}: ${itemHint.name}`);
    if (accountHint.qboId) parts.push(`QBO account ${accountHint.qboId}: ${accountHint.name}`);
    return parts.length ? parts.join(" · ") : undefined;
  }, [accountHint, itemHint]);

  const formSnap = useMemo(
    (): BillFormSnap => ({
      vendorId,
      vendorDisplay,
      itemHint,
      accountHint,
      billDate,
      dueDate,
      amount,
      billNumber,
    }),
    [accountHint, amount, billDate, billNumber, dueDate, itemHint, vendorDisplay, vendorId]
  );
  const { isDirty: formDirty } = useUnsavedChanges(formSnap, baseline ?? formSnap);

  useEffect(() => {
    const snap: BillFormSnap = {
      vendorId: null,
      vendorDisplay: "",
      itemHint: emptyHints,
      accountHint: emptyHints,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      amount: "",
      billNumber: "",
    };
    setBaseline(snap);
  }, []);

  const clearForm = useCallback(() => {
    setVendorId(null);
    setVendorDisplay("");
    setItemHint(emptyHints);
    setAccountHint(emptyHints);
    setBillDate(new Date().toISOString().slice(0, 10));
    setDueDate("");
    setAmount("");
    setBillNumber("");
    setBaseline({
      vendorId: null,
      vendorDisplay: "",
      itemHint: emptyHints,
      accountHint: emptyHints,
      billDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      amount: "",
      billNumber: "",
    });
  }, []);

  useEscapeKey(() => {
    if (!formDirty) return;
    setShowDiscard(true);
  }, formDirty);

  async function saveBill() {
    if (!companyId) return pushToast("Select operating company first", "error");
    const vendorKey = (vendorId ?? vendorDisplay).trim();
    if (!vendorKey) return pushToast("Vendor is required", "error");
    const cents = dollarsToCents(amount);
    if (cents <= 0) return pushToast("Amount must be greater than zero", "error");

    setSubmitting(true);
    try {
      await createVendorBill(companyId, {
        vendor_id: vendorKey,
        bill_number: billNumber.trim() || undefined,
        bill_date: billDate,
        due_date: dueDate.trim() || undefined,
        amount_cents: cents,
        memo,
      });
      pushToast("Vendor bill created", "success");
      const follow = saveFollowRef.current;
      if (follow === "add_another") {
        clearForm();
      } else {
        clearForm();
        if (follow === "print") window.print();
      }
    } catch (error) {
      pushToast(String((error as Error).message || "Failed to create bill"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[min(1280px,calc(100vw-2rem))] space-y-4 p-4 sm:p-6">
      <PageHeader title="Create vendor bill" subtitle="Type-ahead picks mirror QuickBooks vendors, items, and accounts (Phase 1)." />
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <form
        className="mx-auto max-w-3xl space-y-3 rounded border border-gray-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-700 md:col-span-2">
            Vendor (QuickBooks mirror + free text fallback)
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

          <label className="text-xs font-semibold text-gray-700 md:col-span-2">
            Item (reference only — saved into memo)
            <div className="mt-1">
              <QboCombobox
                entityType="item"
                operatingCompanyId={companyId}
                value={itemHint.qboId}
                displayValue={itemHint.name}
                onChange={(qboId, displayName) => setItemHint({ qboId, name: displayName })}
              />
            </div>
          </label>

          <label className="text-xs font-semibold text-gray-700 md:col-span-2">
            Account (reference only — COA UUID field not used for QBO numeric ids)
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

          <label className="text-xs font-semibold text-gray-700">
            Bill date
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Due date
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Amount (USD)
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Bill #
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
          </label>
        </div>

        {memo ? (
          <div className="rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-700">
            <span className="font-semibold">Memo preview:</span> {memo}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <SaveDropdown
            storageKey="vendor-bill-create"
            primaryLabel="Save"
            disabled={!companyId}
            loading={submitting}
            onSave={() => {
              saveFollowRef.current = "default";
              void saveBill();
            }}
            onSaveAndClose={() => {
              saveFollowRef.current = "default";
              void saveBill();
            }}
            onSaveAndAddAnother={() => {
              saveFollowRef.current = "add_another";
              void saveBill();
            }}
            onSaveAndPrint={() => {
              saveFollowRef.current = "print";
              void saveBill();
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
