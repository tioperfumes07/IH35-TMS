import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashGlMapping, setBankAccountCashGl, type CashGlBankAccount } from "../../api/banking";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
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

  // Display-only ParityTable migration: column order, cell content, and the inline
  // SelectCombobox editor (handler unchanged) are preserved 1:1 from the hand-rolled table.
  const columns: Array<ParityColumn<CashGlBankAccount>> = [
    {
      key: "account_name",
      label: "Bank Account",
      sortable: true,
      render: (bank) => <span className="font-medium text-slate-800">{bank.account_name}</span>,
    },
    {
      key: "ledger_account_id",
      label: "Cash GL Account",
      render: (bank) => (
        <SelectCombobox
          value={bank.ledger_account_id ?? ""}
          disabled={!canEdit || savingId === bank.id}
          onChange={(event) => onPick(bank, event.target.value)}
          className="h-9 w-full max-w-md rounded-sm border border-gray-300 px-2 text-sm"
        >
          <option value="">— Not mapped —</option>
          {coaOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectCombobox>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/banking"
        breadcrumb={["Banking", "Cash-GL setup"]}
        title="Bank Account → Cash GL Account"
      />
      {!canEdit ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Read-only: only an Owner or Administrator can change a bank account's cash GL mapping.
        </div>
      ) : null}
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <ParityTable
        columns={columns}
        rows={banks}
        rowKey={(bank) => bank.id}
        loading={query.isLoading}
        storageKey="banking-cash-gl-setup"
        tableTestId="cash-gl-setup-table"
        emptyText="No bank accounts for this company."
      />
      <p className="text-xs text-gray-500">
        Setup only — this maps each bank account to its cash GL account (used by future bank-feed posting). No
        journal entries are posted here.
      </p>
    </div>
  );
}
