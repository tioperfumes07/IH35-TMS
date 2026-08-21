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
import { ConfirmModal } from "../../components/shared/ConfirmModal";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

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
  // NO-NATIVE-DIALOGS-U6 — window.prompt/window.confirm freeze Live Chrome browser automation.
  // In-app shells (VoidReasonModal for the required-reason Hide, ConfirmModal for the plain Unhide
  // confirm) replace them, same audited-reason contract, no native dialog anywhere on this page.
  const [hideTarget, setHideTarget] = useState<BankAccountVisibilityRow | null>(null);
  const [unhideTarget, setUnhideTarget] = useState<BankAccountVisibilityRow | null>(null);

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
    onError: (error) => pushToast(userFacingApiError(error, "Hide failed"), "error"),
    onSettled: () => setBusyId(null),
  });

  const unhideMutation = useMutation({
    mutationFn: (vars: { id: string }) => unhideBankAccount(companyId, vars.id),
    onSuccess: () => {
      pushToast("Bank account unhidden for this company", "success");
      void qc.invalidateQueries({ queryKey: ["banking", "accounts-all", companyId, "include-hidden"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Unhide failed"), "error"),
    onSettled: () => setBusyId(null),
  });

  const accounts = useMemo(
    () => (query.data?.accounts ?? []) as unknown as BankAccountVisibilityRow[],
    [query.data],
  );

  const accountLabel = (account: BankAccountVisibilityRow) =>
    entityLabel(account.account_name ?? account.display_name, account.id, "Account");

  const onHide = (account: BankAccountVisibilityRow) => setHideTarget(account);

  const onUnhide = (account: BankAccountVisibilityRow) => setUnhideTarget(account);

  const columns = useMemo<ParityColumn<BankAccountVisibilityRow>[]>(
    () => [
      {
        key: "account_name",
        label: "Bank Account",
        render: (account) => <span className="font-medium text-slate-800">{accountLabel(account)}</span>,
      },
      {
        key: "institution_name",
        label: "Institution",
        render: (account) => <span className="text-slate-600">{account.institution_name ?? "—"}</span>,
      },
      {
        key: "account_mask",
        label: "Mask",
        render: (account) => <span className="text-slate-600">{account.account_mask ?? "—"}</span>,
      },
      {
        key: "current_balance_cents",
        label: "Balance",
        sortable: true,
        render: (account) => (
          <span className="tabular-nums text-slate-800">{formatCents(account.current_balance_cents)}</span>
        ),
      },
      {
        key: "hidden_at",
        label: "Status",
        render: (account) =>
          account.hidden_at ? (
            <span className="rounded-sm border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Hidden
            </span>
          ) : (
            <span className="rounded-sm border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
              Visible
            </span>
          ),
      },
      {
        key: "hidden_reason",
        label: "Reason",
        render: (account) => <span className="text-slate-600">{account.hidden_reason ?? "—"}</span>,
      },
      {
        key: "action",
        label: "Action",
        render: (account) => {
          if (!canManage) return null;
          const isHidden = Boolean(account.hidden_at);
          return isHidden ? (
            <Button size="sm" variant="secondary" loading={busyId === account.id} onClick={() => onUnhide(account)}>
              Unhide
            </Button>
          ) : (
            <Button size="sm" variant="danger" loading={busyId === account.id} onClick={() => onHide(account)}>
              Hide
            </Button>
          );
        },
      },
    ],
    [busyId, canManage],
  );

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
        this company&apos;s ledger, balance sheet, categorization, reconciliation, and cash flow. Hiding is
        reversible and audited — the account is never deleted.
      </p>
      {!canManage ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Read-only: only an Owner or Administrator can hide or unhide a bank account.
        </div>
      ) : null}
      {query.isError ? (
        <ListErrorBanner onRetry={() => void query.refetch()} />
      ) : (
        // BANK-F3546: ParityTable owns Search+Range+gear; raw HTML table skipped the surface bar.
        <ParityTable<BankAccountVisibilityRow>
          columns={columns}
          rows={accounts}
          rowKey={(account) => account.id}
          loading={query.isLoading}
          emptyText="No bank accounts for this company."
          storageKey="bank-account-visibility"
          exportFilename="bank-account-visibility"
          tableTestId="bank-account-visibility-table"
        />
      )}
      <VoidReasonModal
        open={Boolean(hideTarget)}
        title="Hide bank account"
        entityRef={hideTarget ? accountLabel(hideTarget) : undefined}
        minLength={3}
        postsReversingEntry={false}
        submitLabel="Hide"
        onClose={() => setHideTarget(null)}
        onSubmit={async (reason) => {
          if (!hideTarget) return;
          setBusyId(hideTarget.id);
          await hideMutation.mutateAsync({ id: hideTarget.id, reason });
        }}
      />
      <ConfirmModal
        open={Boolean(unhideTarget)}
        title="Unhide bank account"
        message={unhideTarget ? `Unhide "${accountLabel(unhideTarget)}" for this company?` : ""}
        confirmLabel="Unhide"
        onClose={() => setUnhideTarget(null)}
        onConfirm={async () => {
          if (!unhideTarget) return;
          setBusyId(unhideTarget.id);
          await unhideMutation.mutateAsync({ id: unhideTarget.id });
        }}
      />
    </div>
  );
}
