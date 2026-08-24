import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCashGlMapping, setBankAccountCashGl, type CashGlBankAccount } from "../../api/banking";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

// B-1 Cash-GL setup (fork-A): map each bank account → its COA cash GL account, per entity.
// Owner/Administrator only. NO posting, NO flag — setup only. Reads/writes banking.bank_accounts.ledger_account_id.
export function CashGlSetupPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const canEdit = ["Owner", "Administrator"].includes(String((user as { role?: string } | null)?.role ?? ""));
  const qc = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const { pushToast } = useToast();

  const query = useQuery({
    queryKey: ["banking", "cash-gl-mapping", companyId],
    queryFn: () => getCashGlMapping(companyId),
    enabled: Boolean(companyId),
  });

  const mutation = useMutation({
    mutationFn: (vars: { bankAccountId: string; ledgerAccountId: string | null }) =>
      setBankAccountCashGl(companyId, vars.bankAccountId, vars.ledgerAccountId),
    // BANK-F6321: onSettled alone silently refetched-and-reverted the picker on a rejected write —
    // no toast, no explanation, indistinguishable from a successful save that happened not to
    // stick. Surface the failure explicitly, matching the sibling banking pages' convention.
    onError: (err) => pushToast(userFacingApiError(err, "Could not save the Cash GL mapping"), "error"),
    onSettled: () => {
      setSavingId(null);
      void qc.invalidateQueries({ queryKey: ["banking", "cash-gl-mapping", companyId] });
    },
  });

  const coaOptions = useMemo(
    () => (query.data?.coa_cash_accounts ?? []).map((a) => ({ value: a.id, label: a.account_name })),
    [query.data]
  );
  const banks = query.data?.bank_accounts ?? [];
  const unboundCount = useMemo(
    () => banks.filter((b) => !b.ledger_account_id).length,
    [banks]
  );
  const mappedCount = banks.length - unboundCount;

  const onPick = (bank: CashGlBankAccount, value: string) => {
    setSavingId(bank.id);
    mutation.mutate({ bankAccountId: bank.id, ledgerAccountId: value || null });
  };

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
        <ReferenceSelect
          value={bank.ledger_account_id || null}
          onChange={(next) => onPick(bank, next ?? "")}
          options={coaOptions}
          createKind="account"
          operatingCompanyId={companyId}
          placeholder="— Not mapped —"
          disabled={!canEdit || !companyId || savingId === bank.id}
          onOptionCreated={() => void query.refetch()}
        />
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

      {/* Absence / coverage honesty only after a successful response — never invent "complete". Flat accent (UI-01). */}
      {query.isSuccess && banks.length > 0 && unboundCount > 0 ? (
        <div
          className="border-l-4 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="banking-cash-gl-unbound-honesty-banner"
        >
          <p className="font-semibold">
            Cash GL mapping incomplete: {mappedCount} of {banks.length} bank account(s) mapped · {unboundCount}{" "}
            unbound
          </p>
          <p className="mt-1">
            Unmapped banks cannot open Bank Register / bank-feed GL posting until each row has a Cash GL account.
            Neon live (TRANSP) was 8/16 mapped — do not treat Banking as cash-posting ready while unbound remain.
            Map each &quot;— Not mapped —&quot; row below.
          </p>
        </div>
      ) : null}
      {query.isSuccess && banks.length > 0 && unboundCount === 0 ? (
        <p className="text-xs text-slate-600" data-testid="banking-cash-gl-mapping-complete-note">
          All {banks.length} active bank account(s) have a Cash GL mapping for this company.
        </p>
      ) : null}

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
