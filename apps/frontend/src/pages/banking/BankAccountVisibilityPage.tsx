import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAllAccounts,
  hideBankAccount,
  unhideBankAccount,
  type BankAccountVisibilityRow,
} from "../../api/banking";
import { BackArrowHeader } from "../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";

// [HOLD-FOR-JORGE — TIER 1] Per-entity bank-account HIDE/EXCLUDE (build-and-hold, flag OFF by default).
//
// WHY: TRANSP and TRK share ONE Wells Fargo/Plaid login, so Plaid pulls ALL 4 WF accounts (3 TRANSP + 1
// TRK) into BOTH entities' bank-account lists. This page lets an Owner/Administrator COMPLETELY HIDE the
// other entity's duplicate accounts so they never affect THIS entity's ledger, CoA, balance sheet,
// categorization, reconciliation, or cash flow. Hiding is reversible (unhide) and audited — the account
// row is never deleted, only excluded (void-not-delete).
//
// See docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md for the full list of backend read paths this
// filters. Behind BANK_ACCOUNT_HIDE_ENABLED (default OFF) — this page renders a plain-language notice
// until Jorge flips the per-entity override.
export const BANK_ACCOUNT_HIDE_FLAG_KEY = "BANK_ACCOUNT_HIDE_ENABLED";

function formatCents(value: number | string | null | undefined): string {
  const cents = Number(value ?? 0);
  if (!Number.isFinite(cents)) return "$0.00";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function BankAccountVisibilityPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const canManage = ["Owner", "Administrator"].includes(String((user as { role?: string } | null)?.role ?? ""));
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { enabled: flagEnabled, loading: flagLoading } = useFeatureFlag(BANK_ACCOUNT_HIDE_FLAG_KEY, companyId);

  const query = useQuery({
    queryKey: ["banking", "accounts-all", companyId, "include-hidden"],
    queryFn: () => getAllAccounts(companyId, { include_inactive: true, include_hidden: true }),
    enabled: Boolean(companyId) && flagEnabled,
  });

  const hideMutation = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => hideBankAccount(companyId, vars.id, vars.reason),
    onSuccess: () => {
      pushToast("Bank account hidden for this company", "success");
      void qc.invalidateQueries({ queryKey: ["banking", "accounts-all", companyId, "include-hidden"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Hide failed"), "error"),
    onSettled: () => setBusyId(null),
  });

  const unhideMutation = useMutation({
    mutationFn: (vars: { id: string }) => unhideBankAccount(companyId, vars.id),
    onSuccess: () => {
      pushToast("Bank account unhidden for this company", "success");
      void qc.invalidateQueries({ queryKey: ["banking", "accounts-all", companyId, "include-hidden"] });
    },
    onError: (error) => pushToast(String((error as Error)?.message ?? "Unhide failed"), "error"),
    onSettled: () => setBusyId(null),
  });

  const accounts = useMemo(
    () => (query.data?.accounts ?? []) as unknown as BankAccountVisibilityRow[],
    [query.data]
  );

  const onHide = (account: BankAccountVisibilityRow) => {
    const reason = window.prompt(
      `Hide "${account.account_name ?? account.display_name ?? account.id}" for this company (required reason, min 3 chars):`,
      ""
    );
    if (!reason || reason.trim().length < 3) return;
    setBusyId(account.id);
    hideMutation.mutate({ id: account.id, reason: reason.trim() });
  };

  const onUnhide = (account: BankAccountVisibilityRow) => {
    if (!window.confirm(`Unhide "${account.account_name ?? account.display_name ?? account.id}" for this company?`)) return;
    setBusyId(account.id);
    unhideMutation.mutate({ id: account.id });
  };

  if (flagLoading) {
    return (
      <div className="space-y-3">
        <BackArrowHeader backTo="/banking" breadcrumb={["Banking", "Account Visibility"]} title="Bank Account Visibility" />
        <div className="px-3 py-6 text-sm text-gray-500">Loading…</div>
      </div>
    );
  }

  if (!flagEnabled) {
    return (
      <div className="space-y-3">
        <BackArrowHeader backTo="/banking" breadcrumb={["Banking", "Account Visibility"]} title="Bank Account Visibility" />
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-4 text-sm text-slate-700">
          Bank Account Visibility is not yet enabled for this company. (Feature flag{" "}
          <code>{BANK_ACCOUNT_HIDE_FLAG_KEY}</code> is off.)
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/banking"
        breadcrumb={["Banking", "Account Visibility"]}
        title="Bank Account Visibility"
      />
      <p className="text-xs text-gray-500">
        Hide an account that belongs to another company (shared bank login) so it is fully excluded from
        this company's ledger, balance sheet, categorization, reconciliation, and cash flow. Hiding is
        reversible and audited — the account is never deleted.
      </p>
      {!canManage ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Read-only: only an Owner or Administrator can hide or unhide a bank account.
        </div>
      ) : null}
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Bank Account</th>
              <th className="px-3 py-2 text-left">Institution</th>
              <th className="px-3 py-2 text-left">Mask</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const isHidden = Boolean(account.hidden_at);
              return (
                <tr key={account.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {account.account_name ?? account.display_name ?? account.id}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{account.institution_name ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{account.account_mask ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{formatCents(account.current_balance_cents)}</td>
                  <td className="px-3 py-2">
                    {isHidden ? (
                      <span className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        Hidden
                      </span>
                    ) : (
                      <span className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                        Visible
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{account.hidden_reason ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {canManage ? (
                      isHidden ? (
                        <Button size="sm" variant="secondary" loading={busyId === account.id} onClick={() => onUnhide(account)}>
                          Unhide
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" loading={busyId === account.id} onClick={() => onHide(account)}>
                          Hide
                        </Button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {query.isLoading ? (
          <div className="px-3 py-6 text-sm text-gray-500">Loading bank accounts…</div>
        ) : accounts.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500">No bank accounts for this company.</div>
        ) : null}
      </div>
    </div>
  );
}
