import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashGlMapping, setBankAccountCashGl, type CashGlBankAccount } from "../../api/banking";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";

// B-1 Cash-GL setup (fork-A): map each bank account → its COA cash GL account, per entity.
// Owner/Administrator only. NO posting, NO flag — setup only. Reads/writes banking.bank_accounts.ledger_account_id.
export function CashGlSetupPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const canEdit = ["Owner", "Administrator"].includes(String((user as { role?: string } | null)?.role ?? ""));
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["banking", "cash-gl-mapping", companyId],
    queryFn: () => getCashGlMapping(companyId),
    enabled: Boolean(companyId),
  });

  const mutation = useMutation({
    mutationFn: (vars: { bankAccountId: string; ledgerAccountId: string | null }) =>
      setBankAccountCashGl(companyId, vars.bankAccountId, vars.ledgerAccountId),
    onSettled: () => {
      setSavingId(null);
      void qc.invalidateQueries({ queryKey: ["banking", "cash-gl-mapping", companyId] });
    },
  });

  const coaOptions = useMemo(
    () => (query.data?.coa_cash_accounts ?? []).map((a) => ({ value: a.id, label: `${a.account_number} · ${a.account_name}` })),
    [query.data]
  );
  const banks = query.data?.bank_accounts ?? [];

  const onPick = (bank: CashGlBankAccount, value: string) => {
    setSavingId(bank.id);
    mutation.mutate({ bankAccountId: bank.id, ledgerAccountId: value || null });
  };

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/banking"
        breadcrumb={["Banking", "Cash-GL setup"]}
        title="Bank Account → Cash GL Account"
      />
      {!canEdit ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Read-only: only an Owner or Administrator can change a bank account's cash GL mapping.
        </div>
      ) : null}
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Bank Account</th>
              <th className="px-3 py-2 text-left">Cash GL Account</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((bank) => (
              <tr key={bank.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-slate-800">{bank.account_name}</td>
                <td className="px-3 py-2">
                  <SelectCombobox
                    value={bank.ledger_account_id ?? ""}
                    disabled={!canEdit || savingId === bank.id}
                    onChange={(event) => onPick(bank, event.target.value)}
                    className="h-9 w-full max-w-md rounded border border-gray-300 px-2 text-sm"
                  >
                    <option value="">— Not mapped —</option>
                    {coaOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SelectCombobox>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading ? (
          <div className="px-3 py-6 text-sm text-gray-500">Loading bank accounts…</div>
        ) : banks.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500">No bank accounts for this company.</div>
        ) : null}
      </div>
      <p className="text-xs text-gray-500">
        Setup only — this maps each bank account to its cash GL account (used by future bank-feed posting). No
        journal entries are posted here.
      </p>
    </div>
  );
}
