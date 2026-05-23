import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptBankReconMatch,
  type BankReconWorklistPayload,
  type BankReconWorklistRow,
  closeBankReconPeriod,
  getBankReconWorklist,
  getCoaAccounts,
  getPlaidBankAccounts,
  manualBankReconMatch,
  rejectBankReconMatch,
} from "../../api/banking";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useToast } from "../../components/Toast";

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

type AutoMatchCandidate = BankReconWorklistPayload["auto_matched_candidates"][number];

function isAutoMatchCandidate(row: BankReconWorklistRow | AutoMatchCandidate): row is AutoMatchCandidate {
  return "ledger_entry_kind" in row;
}

export function BankReconciliationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [accountId, setAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedTxId, setSelectedTxId] = useState("");
  const [manualLedgerKind, setManualLedgerKind] = useState<"payment" | "bill_payment" | "transfer" | "je">("payment");
  const [manualLedgerId, setManualLedgerId] = useState("");
  const [varianceAccountId, setVarianceAccountId] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["banking", "accounts", selectedCompanyId],
    queryFn: () => getPlaidBankAccounts(selectedCompanyId!).then((res) => res.accounts),
    enabled: Boolean(selectedCompanyId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "coa-accounts"],
    queryFn: () => getCoaAccounts().then((res) => res.accounts),
  });

  const worklistQuery = useQuery({
    queryKey: ["bank-recon", "worklist", selectedCompanyId, accountId, periodStart, periodEnd],
    queryFn: () =>
      getBankReconWorklist(selectedCompanyId!, {
        account_id: accountId,
        period_start: periodStart,
        period_end: periodEnd,
      }),
    enabled: Boolean(selectedCompanyId && accountId && periodStart && periodEnd),
  });

  const selectedRow = useMemo(() => {
    const all = [...(worklistQuery.data?.unmatched_transactions ?? []), ...(worklistQuery.data?.auto_matched_candidates ?? [])];
    return all.find((row) => row.id === selectedTxId) ?? null;
  }, [selectedTxId, worklistQuery.data]);

  const mutateAndRefresh = async (promise: Promise<unknown>, successMessage: string) => {
    try {
      await promise;
      pushToast(successMessage, "success");
      await queryClient.invalidateQueries({
        queryKey: ["bank-recon", "worklist", selectedCompanyId, accountId, periodStart, periodEnd],
      });
    } catch (error) {
      pushToast(String((error as Error).message ?? "Action failed"), "error");
    }
  };

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !selectedTxId) return;
      const candidate = (worklistQuery.data?.auto_matched_candidates ?? []).find((row) => row.id === selectedTxId);
      if (!candidate) throw new Error("select_auto_match_candidate_first");
      return acceptBankReconMatch({
        operating_company_id: selectedCompanyId,
        bank_transaction_id: candidate.id,
        ledger_entry_kind: candidate.ledger_entry_kind,
        ledger_entry_id: candidate.ledger_entry_id,
        variance_account_id: varianceAccountId || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["bank-recon", "worklist", selectedCompanyId, accountId, periodStart, periodEnd],
      });
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/banking"
        title="Bank Reconciliation"
        subtitle="Review unmatched transactions, accept/reject auto matches, and close reconciled periods."
      />

      <div className="grid grid-cols-1 gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-5">
        <SelectCombobox value={accountId} onChange={(event) => setAccountId(event.target.value)} className="text-sm">
          <option value="">Select bank account</option>
          {(accountsQuery.data ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_name ?? account.id}
            </option>
          ))}
        </SelectCombobox>
        <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        <div className="flex items-center rounded border border-gray-200 px-2 text-xs text-gray-700">
          Progress: {worklistQuery.data?.progress.percent ?? 0}% ({worklistQuery.data?.progress.matched_or_skipped_transactions ?? 0}/
          {worklistQuery.data?.progress.total_transactions ?? 0})
        </div>
        <ActionButton
          disabled={!selectedCompanyId || !accountId || !periodEnd}
          onClick={() =>
            void mutateAndRefresh(
              closeBankReconPeriod({
                operating_company_id: selectedCompanyId!,
                account_id: accountId,
                period_end: periodEnd,
              }),
              "Period closed"
            )
          }
        >
          Close period
        </ActionButton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-3">
          <div className="mb-2 text-sm font-semibold text-gray-900">Bank transactions worklist</div>
          <div className="max-h-[520px] space-y-1 overflow-auto">
            {[...(worklistQuery.data?.unmatched_transactions ?? []), ...(worklistQuery.data?.auto_matched_candidates ?? [])].map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedTxId(row.id)}
                className={`w-full rounded border px-2 py-2 text-left text-xs ${
                  selectedTxId === row.id ? "border-blue-300 bg-blue-50" : "border-gray-100 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{row.transaction_date}</span>
                  <span className="text-gray-600">{money(row.amount_cents)}</span>
                </div>
                <div className="truncate text-gray-700">{row.merchant_name ?? row.description ?? "Bank transaction"}</div>
                {isAutoMatchCandidate(row) ? <div className="text-blue-700">Auto-match candidate: {row.ledger_entry_kind}</div> : <div className="text-gray-500">Unmatched</div>}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Selected transaction actions</div>
            {!selectedRow ? <div className="text-xs text-gray-500">Select a transaction from the worklist.</div> : null}
            {selectedRow ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-700">
                  {selectedRow.transaction_date} · {selectedRow.merchant_name ?? selectedRow.description ?? "-"} · {money(selectedRow.amount_cents)}
                </div>
                <SelectCombobox value={varianceAccountId} onChange={(event) => setVarianceAccountId(event.target.value)} className="text-sm">
                  <option value="">Variance account (required if variance exists)</option>
                  {(coaQuery.data ?? []).map((account) => (
                    <option key={String(account.id)} value={String(account.id)}>
                      {String(account.account_number ?? "")} - {String(account.account_name ?? "")}
                    </option>
                  ))}
                </SelectCombobox>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionButton
                    disabled={acceptMutation.isPending || !isAutoMatchCandidate(selectedRow)}
                    onClick={() => {
                      void acceptMutation
                        .mutateAsync()
                        .then(() => pushToast("Match accepted", "success"))
                        .catch((error) => pushToast(String((error as Error).message), "error"));
                    }}
                  >
                    Accept
                  </ActionButton>
                  <ActionButton
                    disabled={!isAutoMatchCandidate(selectedRow)}
                    onClick={() => {
                      if (!selectedCompanyId || !isAutoMatchCandidate(selectedRow)) return;
                      void mutateAndRefresh(
                        rejectBankReconMatch({
                          operating_company_id: selectedCompanyId,
                          bank_transaction_id: selectedRow.id,
                          ledger_entry_kind: selectedRow.ledger_entry_kind,
                          ledger_entry_id: selectedRow.ledger_entry_id,
                        }),
                        "Match rejected"
                      );
                    }}
                  >
                    Reject
                  </ActionButton>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <SelectCombobox value={manualLedgerKind} onChange={(event) => setManualLedgerKind(event.target.value as typeof manualLedgerKind)} className="text-sm">
                    <option value="payment">payment</option>
                    <option value="bill_payment">bill_payment</option>
                    <option value="transfer">transfer</option>
                    <option value="je">je</option>
                  </SelectCombobox>
                  <input
                    value={manualLedgerId}
                    onChange={(event) => setManualLedgerId(event.target.value)}
                    placeholder="Ledger entry id (uuid)"
                    className="rounded border border-gray-300 px-2 py-1 text-sm md:col-span-2"
                  />
                </div>
                <ActionButton
                  disabled={!selectedCompanyId || !manualLedgerId || !selectedRow}
                  onClick={() => {
                    if (!selectedCompanyId || !selectedRow || !manualLedgerId) return;
                    void mutateAndRefresh(
                      manualBankReconMatch({
                        operating_company_id: selectedCompanyId,
                        bank_transaction_id: selectedRow.id,
                        ledger_entry_kind: manualLedgerKind,
                        ledger_entry_id: manualLedgerId,
                        variance_account_id: varianceAccountId || undefined,
                      }),
                      "Manual match applied"
                    );
                  }}
                >
                  Manual match
                </ActionButton>
              </div>
            ) : null}
          </div>

          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Variance-resolved entries (Q8)</div>
            <div className="max-h-[180px] space-y-1 overflow-auto">
              {(worklistQuery.data?.variance_resolved_entries ?? []).map((entry) => (
                <div key={entry.journal_entry_id} className="rounded border border-gray-100 px-2 py-1 text-xs text-gray-700">
                  {entry.entry_date} · {entry.reference_no ?? entry.journal_entry_id} · {money(entry.variance_cents)}
                </div>
              ))}
              {(worklistQuery.data?.variance_resolved_entries ?? []).length === 0 ? <div className="text-xs text-gray-500">No variance entries in this period.</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
