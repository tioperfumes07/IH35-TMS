import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { createVendorBill } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { QboCombobox } from "../../components/forms/QboCombobox";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

function dollarsToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function ExpenseCreatePage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorDisplay, setVendorDisplay] = useState("");
  const [accountHint, setAccountHint] = useState<{ qboId: string | null; name: string }>({ qboId: null, name: "" });
  const [billDate, setBillDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const memo = useMemo(() => {
    const parts = ["Expense capture (Phase 1 placeholder until dedicated expense API ships)"];
    if (accountHint.qboId) parts.push(`QBO account ${accountHint.qboId}: ${accountHint.name}`);
    return parts.join(" · ");
  }, [accountHint]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
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
      setAmount("");
      setVendorId(null);
      setVendorDisplay("");
      setAccountHint({ qboId: null, name: "" });
    } catch (error) {
      pushToast(String((error as Error).message || "Failed to record expense"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Create expense" subtitle="Record a vendor expense or bill payment" />
      {!companyId ? <div className="text-sm text-red-600">Select an operating company in the shell header.</div> : null}
      <form className="mx-auto max-w-3xl space-y-3 rounded border border-gray-200 bg-white p-4" onSubmit={onSubmit}>
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

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting || !companyId}>
            {submitting ? "Saving…" : "Save expense"}
          </Button>
        </div>
      </form>
    </div>
  );
}
