import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createVendorBill } from "../../api/accounting";
import { getCoaAccounts } from "../../api/banking";
import { listVendors } from "../../api/mdata";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useToast } from "../../components/Toast";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";

type SeedDraft = {
  bank_transaction_id?: string;
  transaction_date?: string;
  amount_cents?: number;
  description?: string;
};

type BillDraftRow = {
  id: string;
  bank_transaction_id: string;
  vendor_id: string;
  bill_date: string;
  due_date: string;
  bill_number: string;
  amount: number | null; // M-1: dollar number (was a dollars-string); amount_cents = round(amount*100) byte-for-byte
  memo: string;
  coa_account_id: string;
};

function centsToDollars(cents: number): number | null {
  const c = Math.round(cents);
  return c > 0 ? c / 100 : null;
}

function rowFromSeed(seed: SeedDraft, index: number): BillDraftRow {
  return {
    id: `seed-${index}-${seed.bank_transaction_id ?? "txn"}`,
    bank_transaction_id: seed.bank_transaction_id ?? "",
    vendor_id: "",
    bill_date: seed.transaction_date ?? "",
    due_date: "",
    bill_number: "",
    amount: centsToDollars(Math.abs(Number(seed.amount_cents) || 0)),
    memo: seed.description ?? "",
    coa_account_id: "",
  };
}

function emptyRow(): BillDraftRow {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    bank_transaction_id: "",
    vendor_id: "",
    bill_date: "",
    due_date: "",
    bill_number: "",
    amount: null,
    memo: "",
    coa_account_id: "",
  };
}

type CreateResult = {
  ok: number;
  failed: Array<{ rowId: string; reason: string }>;
};

export function CreateMultipleBillsPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const seeds = ((location.state as { seeds?: SeedDraft[] } | null)?.seeds ?? []).filter(Boolean);
  const [rows, setRows] = useState<BillDraftRow[]>(() => (seeds.length > 0 ? seeds.map(rowFromSeed) : [emptyRow()]));
  const [lastResult, setLastResult] = useState<CreateResult | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ["multi-bills", "vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 200 }),
    enabled: Boolean(companyId),
  });

  const coaQuery = useQuery({
    queryKey: ["multi-bills", "coa", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const failed: Array<{ rowId: string; reason: string }> = [];
      let ok = 0;

      for (const row of rows) {
        const amountCents = Math.round(Number(row.amount) * 100);
        if (!row.vendor_id || !row.bill_date || !Number.isFinite(amountCents) || amountCents <= 0) {
          failed.push({ rowId: row.id, reason: "Missing vendor, bill date, or positive amount" });
          continue;
        }
        try {
          await createVendorBill(companyId, {
            vendor_id: row.vendor_id,
            bill_number: row.bill_number.trim() || undefined,
            bill_date: row.bill_date,
            due_date: row.due_date || undefined,
            amount_cents: amountCents,
            memo: row.memo.trim() || undefined,
            coa_account_id: row.coa_account_id || undefined,
          });
          ok += 1;
        } catch (error) {
          failed.push({ rowId: row.id, reason: String((error as Error)?.message ?? "Failed to create bill") });
        }
      }

      return { ok, failed };
    },
    onSuccess: async (result) => {
      setLastResult(result);
      await queryClient.invalidateQueries({ queryKey: ["accounting", "bills"] });
      await queryClient.invalidateQueries({ queryKey: ["banking"] });
      if (result.ok > 0) pushToast(`Created ${result.ok} bill(s)`, "success");
      if (result.failed.length > 0) pushToast(`${result.failed.length} row(s) failed`, "error");
    },
  });

  const totalUsd = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const cents = Math.round(Number(row.amount) * 100);
        return Number.isFinite(cents) ? sum + Math.max(0, cents) : sum;
      }, 0) / 100,
    [rows]
  );

  const updateRow = (rowId: string, patch: Partial<BillDraftRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Create multiple bills" subtitle="Bulk vendor bill drafting from selected bank transactions." />
      {!companyId ? <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Select an operating company.</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm">
        <span className="font-medium text-gray-800">Rows: {rows.length}</span>
        <span className="text-gray-700">Total draft amount: ${totalUsd.toFixed(2)}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setRows((current) => [...current, emptyRow()])}>
            Add row
          </Button>
          <Button size="sm" disabled={!companyId || rows.length === 0} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create bills
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Source tx</th>
              <th className="px-2 py-2">Vendor</th>
              <th className="px-2 py-2">Bill date</th>
              <th className="px-2 py-2">Due date</th>
              <th className="px-2 py-2">Bill #</th>
              <th className="px-2 py-2 text-right">Amount (USD)</th>
              <th className="px-2 py-2">A/P account</th>
              <th className="px-2 py-2">Memo</th>
              <th className="px-2 py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">
                  {row.bank_transaction_id ? row.bank_transaction_id.slice(0, 8) : "manual"}
                </td>
                <td className="px-2 py-1.5">
                  <SelectCombobox className="h-8 min-w-[180px] rounded border border-gray-300 px-2" value={row.vendor_id} onChange={(event) => updateRow(row.id, { vendor_id: event.target.value })}>
                    <option value="">Select vendor…</option>
                    {(vendorsQuery.data?.vendors ?? []).map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </SelectCombobox>
                </td>
                <td className="px-2 py-1.5">
                  <input type="date" className="h-8 rounded border border-gray-300 px-2" value={row.bill_date} onChange={(event) => updateRow(row.id, { bill_date: event.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="date" className="h-8 rounded border border-gray-300 px-2" value={row.due_date} onChange={(event) => updateRow(row.id, { due_date: event.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="h-8 rounded border border-gray-300 px-2" value={row.bill_number} onChange={(event) => updateRow(row.id, { bill_number: event.target.value })} />
                </td>
                <td className="px-2 py-1.5">
                  {/* M-1: dollars-mode QBO money entry; amount stays a DOLLAR number → amount_cents byte-for-byte. */}
                  <MoneyInput
                    valueDollars={row.amount}
                    onChangeDollars={(d) => updateRow(row.id, { amount: d })}
                    ariaLabel="Bill amount (USD)"
                    className="w-28"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <SelectCombobox className="h-8 min-w-[180px] rounded border border-gray-300 px-2" value={row.coa_account_id} onChange={(event) => updateRow(row.id, { coa_account_id: event.target.value })}>
                    <option value="">Optional</option>
                    {(coaQuery.data?.accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.account_number} - {account.account_name}
                      </option>
                    ))}
                  </SelectCombobox>
                </td>
                <td className="px-2 py-1.5">
                  <input className="h-8 min-w-[220px] rounded border border-gray-300 px-2" value={row.memo} onChange={(event) => updateRow(row.id, { memo: event.target.value })} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                    onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                    disabled={rows.length <= 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastResult ? (
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <p className="font-semibold text-gray-900">Last run: {lastResult.ok} created, {lastResult.failed.length} failed.</p>
          {lastResult.failed.length > 0 ? (
            <ul className="mt-1 space-y-1 text-red-700">
              {lastResult.failed.map((failure) => (
                <li key={`${failure.rowId}-${failure.reason}`}>{failure.rowId}: {failure.reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
