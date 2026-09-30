import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getReconciliationSessions,
  startReconciliationSession,
  type ReconciliationSession,
} from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { SelectCombobox } from "../../../components/Combobox";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { formatUsdCents } from "../../../lib/money";
import { BANKING_TAB_PATH } from "../../../router/route-manifest";
import { entityLabel } from "../../../lib/entity-label";

export type ReconShellAccount = {
  id: string;
  label: string;
  ledgerAccountId?: string | null;
};

type Props = {
  companyId: string;
  accounts: ReconShellAccount[];
  uncategorizedCount: number;
  /** When true (deep link ?start=1 or Home attention strip), expand the start form. */
  preferStartOpen?: boolean;
};

function money(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return formatUsdCents(Number(cents));
}

function formatReconciledAt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * C-53 — Banking Reconciliation screen shell.
 * Fully wired to existing reconciliation_sessions + start/workspace routes.
 * MATCHED tri-state (matched / unmatched / matched-with-difference) is labeled and reserved —
 * engine wire waits on CC-1 A-27. Statement object fields that already exist on the session are shown.
 * SAVE+CLOSE on the start opener. No new GL math. No accounting schema invent.
 */
export function ReconciliationTabContent({
  companyId,
  accounts,
  uncategorizedCount,
  preferStartOpen = false,
}: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [selectedAccountId, setSelectedAccountId] = useState(() => accounts[0]?.id ?? "");
  const [startOpen, setStartOpen] = useState(preferStartOpen || searchParams.get("start") === "1");
  const [reconPeriodStart, setReconPeriodStart] = useState("");
  const [reconPeriodEnd, setReconPeriodEnd] = useState("");
  const [reconStatementBalance, setReconStatementBalance] = useState("");
  const [startingRecon, setStartingRecon] = useState(false);

  useEffect(() => {
    if (preferStartOpen || searchParams.get("start") === "1") setStartOpen(true);
  }, [preferStartOpen, searchParams]);

  useEffect(() => {
    if (!selectedAccountId && accounts[0]?.id) setSelectedAccountId(accounts[0].id);
  }, [accounts, selectedAccountId]);

  const sessionsQuery = useQuery({
    queryKey: ["banking", "reconciliation-sessions", companyId, selectedAccountId || "all"],
    queryFn: () => getReconciliationSessions(companyId, selectedAccountId || undefined),
    enabled: Boolean(companyId),
  });

  const allSessionsQuery = useQuery({
    queryKey: ["banking", "reconciliation-sessions", companyId, "shell-all"],
    queryFn: () => getReconciliationSessions(companyId),
    enabled: Boolean(companyId),
  });

  const openSessions = sessionsQuery.data?.open_sessions ?? [];
  const completedSessions = sessionsQuery.data?.completed_sessions ?? [];
  const allOpen = allSessionsQuery.data?.open_sessions ?? [];
  const allCompleted = allSessionsQuery.data?.completed_sessions ?? [];

  const accountStatus = useMemo(() => {
    return accounts.map((acct) => {
      const open = allOpen.filter((s) => s.bank_account_id === acct.id);
      const completed = allCompleted.filter((s) => s.bank_account_id === acct.id);
      const latest = [...completed].sort((a, b) => {
        const ta = a.reconciled_at ? Date.parse(a.reconciled_at) : 0;
        const tb = b.reconciled_at ? Date.parse(b.reconciled_at) : 0;
        return tb - ta;
      })[0];
      return {
        account: acct,
        openCount: open.length,
        completedCount: completed.length,
        latest,
        neverReconciled: completed.length === 0 && open.length === 0,
      };
    });
  }, [accounts, allOpen, allCompleted]);

  const neverReconciledCount = accountStatus.filter((r) => r.neverReconciled).length;
  const activeOpenSession = openSessions[0] ?? null;
  const priorCompleted = completedSessions[0] ?? null;

  const beginningBalanceCents =
    (activeOpenSession as ReconciliationSession & { beginning_balance_cents?: number | null })
      ?.beginning_balance_cents ??
    priorCompleted?.statement_balance_cents ??
    0;
  const statementBalanceCents = activeOpenSession?.statement_balance_cents ?? null;
  const varianceCents = activeOpenSession?.variance_cents ?? null;

  const closeStart = () => {
    setStartOpen(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("start");
        return next;
      },
      { replace: true },
    );
  };

  const openWorkspace = (session: ReconciliationSession) => {
    navigate(
      `/banking/reconciliation-workspace?session_id=${session.id}&bank_account_hint=${session.bank_account_id}`,
    );
  };

  return (
    <div className="space-y-3" data-c53-recon-shell="1" data-testid="banking-recon-shell">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Reconciliation</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/banking/reconcile" className="text-xs font-medium text-slate-700 hover:underline">
              Open Reconcile Queue
            </Link>
            <Link
              to="/banking/reconciliation-workspace"
              className="text-xs font-medium text-slate-700 hover:underline"
            >
              Open Workspace
            </Link>
            <ActionButton
              onClick={() => {
                setStartOpen(true);
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.set("start", "1");
                    return next;
                  },
                  { replace: true },
                );
              }}
            >
              + Start reconciliation
            </ActionButton>
          </div>
        </div>

        {neverReconciledCount === accounts.length && accounts.length > 0 ? (
          <div
            className="mb-3 border-l-4 border-slate-400 bg-slate-100 px-3 py-2 text-xs text-slate-700"
            data-testid="banking-recon-never-completed-banner"
          >
            <p className="font-semibold">No reconciliation sessions exist for this company yet.</p>
            <p className="mt-1">
              Statement reconcile is not proven live until a session is started and completed to a $0.00
              difference. Uncategorized / for-review bank transactions still need Match or Categorize (
              {uncategorizedCount.toLocaleString()} currently flagged). Do not treat this screen as
              reconciled.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton onClick={() => setStartOpen(true)}>+ Start first reconciliation</ActionButton>
              <ActionButton
                onClick={() => navigate(`${BANKING_TAB_PATH.transactions}?type=uncategorized`)}
              >
                Open for-review queue
              </ActionButton>
            </div>
          </div>
        ) : null}

        {sessionsQuery.isError || allSessionsQuery.isError ? (
          <ListErrorBanner
            onRetry={() => {
              void sessionsQuery.refetch();
              void allSessionsQuery.refetch();
            }}
          />
        ) : null}

        {/* Per-account readiness — QBO recon starts from the account, not a blank queue. */}
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">Accounts</p>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-c53-account-status="1">
          {accountStatus.length === 0 ? (
            <p className="text-xs text-gray-500">No bank accounts available to reconcile.</p>
          ) : (
            accountStatus.map((row) => {
              const selected = row.account.id === selectedAccountId;
              const tone = row.neverReconciled
                ? "border-amber-300 bg-amber-50"
                : row.openCount > 0
                  ? "border-sky-300 bg-sky-50"
                  : "border-gray-200 bg-white";
              return (
                <button
                  key={row.account.id}
                  type="button"
                  data-c53-account-tile={row.account.id}
                  className={`rounded-sm border px-2 py-2 text-left text-xs ${tone} ${
                    selected ? "ring-1 ring-[#14314F]" : ""
                  }`}
                  onClick={() => setSelectedAccountId(row.account.id)}
                >
                  <p className="font-semibold text-[#0F1219]">{row.account.label}</p>
                  <p className="mt-1 text-center text-[#6B7280]">
                    {row.neverReconciled
                      ? "Never reconciled"
                      : row.openCount > 0
                        ? `${row.openCount} open session${row.openCount === 1 ? "" : "s"}`
                        : `Last reconciled ${formatReconciledAt(row.latest?.reconciled_at)}`}
                  </p>
                  {row.latest ? (
                    <p className="mt-0.5 text-center text-[#1F2A44]">
                      Ending {money(row.latest.statement_balance_cents)}
                    </p>
                  ) : null}
                  {!row.account.ledgerAccountId ? (
                    <p className="mt-1 text-center text-amber-800">Cash GL unbound</p>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Statement object — fields already on reconciliation_sessions; A-27 does not reinvent these. */}
          <div
            className="rounded-sm border border-gray-200 bg-[#F7F8FA] p-3"
            data-c53-statement-object="1"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Statement
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-[#6B7280]">Beginning balance</dt>
              <dd className="text-center font-medium text-[#0F1219]">{money(beginningBalanceCents)}</dd>
              <dt className="text-[#6B7280]">Statement ending balance</dt>
              <dd className="text-center font-medium text-[#0F1219]">
                {activeOpenSession ? money(statementBalanceCents) : "— enter to start"}
              </dd>
              <dt className="text-[#6B7280]">Cleared (session)</dt>
              <dd className="text-center text-[#6B7280]">Opens in workspace</dd>
              <dt className="text-[#6B7280]">Deposits in transit</dt>
              <dd className="text-center text-[#6B7280]">Workspace compute</dd>
              <dt className="text-[#6B7280]">Outstanding checks</dt>
              <dd className="text-center text-[#6B7280]">Workspace compute</dd>
              <dt className="text-[#6B7280]">Difference</dt>
              <dd
                className={`text-center font-semibold ${
                  varianceCents === 0
                    ? "text-[#16A34A]"
                    : varianceCents == null
                      ? "text-[#6B7280]"
                      : "text-amber-800"
                }`}
                data-c53-difference={varianceCents ?? "none"}
              >
                {activeOpenSession ? money(varianceCents) : "— must reach $0.00 to finish"}
              </dd>
            </dl>
            {activeOpenSession ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton onClick={() => openWorkspace(activeOpenSession)}>
                  Continue open session
                </ActionButton>
              </div>
            ) : null}
          </div>

          {/* MATCHED tri-state shell — engine wire waits on CC-1 A-27. Do not invent boolean match here. */}
          <div
            className="rounded-sm border border-dashed border-gray-300 bg-white p-3"
            data-c53-matched-tristate="1"
            data-c53-a27-pending="1"
          >
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Matched state (A-27)
            </p>
            <p className="mb-2 text-xs text-[#6B7280]">
              Bank Register Matched must be a three-state, not Yes/No. Shell reserved; engine wire waits
              on CC-1 A-27 (matched / unmatched / matched with difference). Parallel books — reconcile
              first.
            </p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center justify-between rounded-sm border border-gray-100 px-2 py-1">
                <span className="font-medium text-[#0F1219]">Matched</span>
                <span className="text-[#6B7280]">Awaiting A-27</span>
              </li>
              <li className="flex items-center justify-between rounded-sm border border-gray-100 px-2 py-1">
                <span className="font-medium text-[#0F1219]">Unmatched</span>
                <span className="text-[#6B7280]">Awaiting A-27</span>
              </li>
              <li className="flex items-center justify-between rounded-sm border border-gray-100 px-2 py-1">
                <span className="font-medium text-[#0F1219]">Matched with difference</span>
                <span className="text-[#6B7280]">Awaiting A-27</span>
              </li>
            </ul>
          </div>
        </div>

        {/* SAVE+CLOSE start opener — required human-entered statement_balance_cents (A-27/A-35). */}
        {startOpen ? (
          <div
            className="mb-3 rounded-sm border border-[#14314F]/30 bg-white p-3"
            data-c53-start-opener="1"
            data-testid="banking-recon-start-form"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                Start reconciliation
              </p>
              <ActionButton onClick={closeStart}>Close</ActionButton>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                  Bank account
                </span>
                <SelectCombobox
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">Select bank account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                  Statement ending balance
                </span>
                <MoneyInput
                  valueDollars={reconStatementBalance ? Number(reconStatementBalance) : null}
                  onChangeDollars={(d) => setReconStatementBalance(d == null ? "" : String(d))}
                  ariaLabel="Statement balance (USD)"
                  placeholder="Statement balance (USD)"
                  className="text-xs"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                  Period start
                </span>
                <DatePicker value={reconPeriodStart} onChange={(next) => setReconPeriodStart(next)} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[#4B5563]">
                  Period end
                </span>
                <DatePicker value={reconPeriodEnd} onChange={(next) => setReconPeriodEnd(next)} />
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <ActionButton onClick={closeStart}>Cancel</ActionButton>
              <ActionButton
                disabled={
                  !selectedAccountId ||
                  !reconPeriodStart ||
                  !reconPeriodEnd ||
                  !reconStatementBalance ||
                  startingRecon
                }
                onClick={() => {
                  setStartingRecon(true);
                  void startReconciliationSession({
                    bank_account_id: selectedAccountId,
                    period_start: reconPeriodStart,
                    period_end: reconPeriodEnd,
                    statement_balance_cents: Math.round(Number(reconStatementBalance) * 100),
                  })
                    .then((res) => {
                      closeStart();
                      void queryClient.invalidateQueries({
                        queryKey: ["banking", "reconciliation-sessions", companyId],
                      });
                      navigate(
                        `/banking/reconciliation-workspace?session_id=${res.session_id}&bank_account_hint=${selectedAccountId}`,
                      );
                    })
                    .catch((error) =>
                      pushToast(userFacingApiError(error, "Failed to start reconciliation"), "error"),
                    )
                    .finally(() => setStartingRecon(false));
                }}
              >
                {startingRecon ? "Starting..." : "Create session"}
              </ActionButton>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Open sessions
              {selectedAccountId
                ? ` · ${entityLabel(accounts.find((a) => a.id === selectedAccountId)?.label, selectedAccountId, "Account")}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-gray-700">Open: {openSessions.length}</p>
            <div className="mt-2 space-y-1">
              {openSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="w-full rounded-sm border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                  onClick={() => openWorkspace(session)}
                >
                  Open: {session.period_start} to {session.period_end} · difference{" "}
                  {money(session.variance_cents)}
                </button>
              ))}
              {openSessions.length === 0 ? (
                <p className="text-xs text-gray-500">No open reconciliation sessions for this account.</p>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">
              Recent completed
            </p>
            <div className="mt-2 space-y-1">
              {completedSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="w-full rounded-sm border border-gray-100 px-2 py-1 text-left text-xs hover:bg-gray-50"
                  onClick={() => openWorkspace(session)}
                >
                  {session.period_start} to {session.period_end} · ending{" "}
                  {money(session.statement_balance_cents)} · difference {money(session.variance_cents)}
                </button>
              ))}
              {completedSessions.length === 0 ? (
                <p className="text-xs text-gray-500">No completed sessions yet for this account.</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
