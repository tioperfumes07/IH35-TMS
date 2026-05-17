import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPlaidBankAccounts, getTransfer, listTransfers, revokeTransfer, type TransferType } from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

const PAGE_SIZE = 50;

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function typeLabel(type: TransferType) {
  return type.replaceAll("_", " ");
}

export function TransfersListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [fromDate, setFromDate] = useState(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<TransferType | "">("");
  const [status, setStatus] = useState<"active" | "revoked" | "">("active");
  const [accountId, setAccountId] = useState("");
  const [offset, setOffset] = useState(0);
  const [revokingId, setRevokingId] = useState("");

  const canRevoke = auth.user?.role === "Owner";

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const transfersQuery = useQuery({
    queryKey: ["banking", "transfers", companyId, fromDate, toDate, type, status, accountId, offset],
    queryFn: () =>
      listTransfers(companyId, {
        from: fromDate || undefined,
        to: toDate || undefined,
        type: (type || undefined) as TransferType | undefined,
        status: (status || undefined) as "active" | "revoked" | undefined,
        accountId: accountId || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: Boolean(companyId),
  });

  const rows = transfersQuery.data?.transfers ?? [];
  const hasNext = rows.length === PAGE_SIZE;
  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of bankAccountsQuery.data?.accounts ?? []) {
      map.set(account.id, `${account.institution_name || "Bank"} - ${account.account_name || "Account"}`);
    }
    return map;
  }, [bankAccountsQuery.data?.accounts]);

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/banking"
        title="Transfers"
        subtitle="Bank transfers and credit-card payments"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/banking" className="text-sm text-blue-700 hover:underline">
              Back to Banking Home
            </Link>
          </div>
        }
      />
      {transfersQuery.isError ? <ListErrorBanner onRetry={() => void transfersQuery.refetch()} /> : null}

      <div className="grid grid-cols-1 gap-3 rounded border border-gray-200 bg-white p-3 md:grid-cols-6">
        <label className="text-xs text-gray-600">
          From
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="text-xs text-gray-600">
          To
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="text-xs text-gray-600">
          Type
          <SelectCombobox value={type} onChange={(e) => setType(e.target.value as TransferType | "")} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="">All</option>
            <option value="bank_to_bank">Bank-to-Bank</option>
            <option value="cc_payment">CC Payment</option>
            <option value="cash_deposit">Cash Deposit</option>
            <option value="owner_contribution">Owner Contribution</option>
            <option value="owner_distribution">Owner Distribution</option>
          </SelectCombobox>
        </label>
        <label className="text-xs text-gray-600">
          Account
          <SelectCombobox value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="">All</option>
            {(bankAccountsQuery.data?.accounts ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.institution_name || "Bank"} - {account.account_name || "Account"}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs text-gray-600">
          Status
          <SelectCombobox value={status} onChange={(e) => setStatus(e.target.value as "active" | "revoked" | "")} className="mt-1 h-8 w-full rounded border border-gray-300 px-2 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </SelectCombobox>
        </label>
        <div className="flex items-end gap-2">
          <ActionButton
            onClick={() => {
              setOffset(0);
              void transfersQuery.refetch();
            }}
          >
            Apply
          </ActionButton>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white p-3">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="border-b border-gray-200 px-2 py-2">Date</th>
              <th className="border-b border-gray-200 px-2 py-2">Type</th>
              <th className="border-b border-gray-200 px-2 py-2">From</th>
              <th className="border-b border-gray-200 px-2 py-2">To</th>
              <th className="border-b border-gray-200 px-2 py-2">Amount</th>
              <th className="border-b border-gray-200 px-2 py-2">Memo</th>
              <th className="border-b border-gray-200 px-2 py-2">Reference</th>
              <th className="border-b border-gray-200 px-2 py-2">QBO Status</th>
              <th className="border-b border-gray-200 px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border-b border-gray-100 px-2 py-2">{row.transfer_date}</td>
                <td className="border-b border-gray-100 px-2 py-2 capitalize">{typeLabel(row.transfer_type)}</td>
                <td className="border-b border-gray-100 px-2 py-2">{row.from_bank_name || row.from_coa_name || accountNameMap.get(row.from_account_id) || row.from_account_id}</td>
                <td className="border-b border-gray-100 px-2 py-2">{row.to_bank_name || row.to_coa_name || accountNameMap.get(row.to_account_id) || row.to_account_id}</td>
                <td className="border-b border-gray-100 px-2 py-2">{formatMoney(Number(row.amount_cents))}</td>
                <td className="border-b border-gray-100 px-2 py-2">{row.memo || "-"}</td>
                <td className="border-b border-gray-100 px-2 py-2">{row.reference_number || "-"}</td>
                <td className="border-b border-gray-100 px-2 py-2">
                  {row.revoked_at ? (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">revoked</span>
                  ) : row.qbo_journal_entry_id ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">synced</span>
                  ) : (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">pending</span>
                  )}
                </td>
                <td className="border-b border-gray-100 px-2 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-blue-700 hover:underline"
                      onClick={() => {
                        if (!companyId) return;
                        void getTransfer(row.id, companyId)
                          .then((detail) => {
                            window.alert(
                              `Transfer ${detail.transfer.id}\nType: ${detail.transfer.transfer_type}\nAmount: ${formatMoney(
                                Number(detail.transfer.amount_cents)
                              )}\nMemo: ${detail.transfer.memo || "-"}\nQBO JE: ${detail.transfer.qbo_journal_entry_id || "pending"}`
                            );
                          })
                          .catch((error) => pushToast(String((error as Error).message || "Failed to load transfer detail"), "error"));
                      }}
                    >
                      View
                    </button>
                    {canRevoke && !row.revoked_at ? (
                      <button
                        type="button"
                        className="text-xs text-red-700 hover:underline disabled:opacity-60"
                        disabled={revokingId === row.id}
                        onClick={() => {
                          const reason = window.prompt("Revocation reason");
                          if (!reason || !companyId) return;
                          setRevokingId(row.id);
                          void revokeTransfer(row.id, companyId, reason)
                            .then(() => {
                              pushToast("Transfer revoked", "success");
                              return Promise.all([
                                queryClient.invalidateQueries({ queryKey: ["banking", "transfers"] }),
                                queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts"] }),
                              ]);
                            })
                            .catch((error) => pushToast(String((error as Error).message || "Failed to revoke transfer"), "error"))
                            .finally(() => setRevokingId(""));
                        }}
                      >
                        Revoke
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-4 text-center text-sm text-gray-500">
                  No transfers found for this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <ActionButton
          disabled={offset === 0}
          onClick={() => {
            setOffset((value) => Math.max(0, value - PAGE_SIZE));
          }}
        >
          Previous
        </ActionButton>
        <ActionButton
          disabled={!hasNext}
          onClick={() => {
            setOffset((value) => value + PAGE_SIZE);
          }}
        >
          Next
        </ActionButton>
      </div>
    </div>
  );
}

