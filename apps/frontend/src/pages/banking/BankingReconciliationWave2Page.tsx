import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import {
  createReconciliationSession,
  finalizeReconciliationSession,
  getReconciliationSessionDetail,
  listReconciliationSessions,
} from "../../api/banking-wave2";
import { getPlaidBankAccounts } from "../../api/banking";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatCurrencyCents, formatDate } from "../../lib/format";

export function BankingReconciliationListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [stmtBal, setStmtBal] = useState("");

  const sessionsQuery = useQuery({
    queryKey: ["banking", "reconciliation-sessions", companyId],
    queryFn: () => listReconciliationSessions(companyId),
    enabled: Boolean(companyId),
  });

  const banksQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId, "recon-list"],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createReconciliationSession({
        operating_company_id: companyId,
        account_id: accountId,
        period_start: periodStart,
        period_end: periodEnd,
        statement_balance_cents: Math.round(Number(stmtBal) * 100),
      }),
    onSuccess: () => {
      pushToast("Reconciliation session created", "success");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["banking", "reconciliation-sessions"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Create failed"), "error"),
  });

  const items = sessionsQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bank reconciliation"
        subtitle="Wave 2 sessions — finalize when variance is zero."
        actions={
          <ActionButton
            type="button"
            className="bg-blue-600 text-white"
            aria-label="Create reconciliation session"
            disabled={!companyId}
            onClick={() => setOpen(true)}
          >
            + Create
          </ActionButton>
        }
      />
      <p className="text-sm text-gray-600">
        Legacy two-column workspace:{" "}
        <Link className="text-blue-700 underline" to="/banking/reconciliation/workspace">
          open legacy workspace
        </Link>
        .
      </p>
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}
      {sessionsQuery.isError ? <ListErrorBanner onRetry={() => void sessionsQuery.refetch()} /> : null}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Variance</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const id = String(s.id ?? "");
              const v = Number(s.variance_cents ?? 0);
              const st = String(s.status ?? "");
              return (
                <tr key={id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    {formatDate(String(s.period_start ?? ""))} – {formatDate(String(s.period_end ?? ""))}
                  </td>
                  <td className={`px-3 py-2 ${v !== 0 ? "font-semibold text-red-700" : "text-green-700"}`}>{formatCurrencyCents(v)}</td>
                  <td className="px-3 py-2">{st}</td>
                  <td className="px-3 py-2">
                    <Link className="text-blue-700 underline" to={`/banking/reconciliation/sessions/${id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!sessionsQuery.isLoading && items.length === 0 ? <p className="p-4 text-sm text-gray-600">No sessions yet.</p> : null}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create reconciliation session" sizePreset="md" resizable modalKind="recon-create">
        <div className="space-y-2 text-sm">
          <label className="block">
            Bank account
            <select className="mt-1 w-full rounded border px-2 py-1" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">—</option>
              {(banksQuery.data?.accounts ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {(b.institution_name || "") + " — " + (b.account_name || "")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Period start
            <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label className="block">
            Period end
            <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <label className="block">
            Statement ending balance (USD)
            <input className="mt-1 w-full rounded border px-2 py-1" value={stmtBal} onChange={(e) => setStmtBal(e.target.value)} />
          </label>
          <ActionButton
            type="button"
            className="w-full bg-blue-600 text-white"
            aria-label="Save reconciliation session"
            disabled={!accountId || !periodStart || !periodEnd || !stmtBal || createMut.isPending}
            onClick={() => void createMut.mutateAsync()}
          >
            Save
          </ActionButton>
        </div>
      </Modal>
    </div>
  );
}

export function BankingReconciliationSessionPage({ sessionId }: { sessionId: string }) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();

  const detailQuery = useQuery({
    queryKey: ["banking", "reconciliation-session", sessionId, companyId],
    queryFn: () => getReconciliationSessionDetail(sessionId, companyId),
    enabled: Boolean(companyId) && Boolean(sessionId),
  });

  const finMut = useMutation({
    mutationFn: () => finalizeReconciliationSession(sessionId, companyId),
    onSuccess: () => {
      pushToast("Reconciliation finalized", "success");
      void qc.invalidateQueries({ queryKey: ["banking", "reconciliation-sessions"] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Finalize failed"), "error"),
  });

  const session = detailQuery.data?.session ?? null;
  const txns = detailQuery.data?.matched_transactions ?? [];
  const variance = session ? Number(session.variance_cents ?? 0) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Reconciliation session" subtitle={sessionId} />
      <Link className="text-sm text-blue-700 underline" to="/banking/reconciliation">
        ← Back to list
      </Link>
      {detailQuery.isError ? <ListErrorBanner onRetry={() => void detailQuery.refetch()} /> : null}
      {session ? (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              Period: {formatDate(String(session.period_start ?? ""))} – {formatDate(String(session.period_end ?? ""))}
            </div>
            <div>
              Variance:{" "}
              <span className={variance !== 0 ? "font-semibold text-red-700" : "text-green-700"}>{formatCurrencyCents(variance)}</span>
            </div>
            <div>Status: {String(session.status ?? "—")}</div>
          </div>
          <div className="mt-3">
            <ActionButton
              type="button"
              className="border border-emerald-200 bg-emerald-50 text-emerald-900"
              aria-label="Finalize reconciliation when variance is zero"
              disabled={finMut.isPending || variance !== 0}
              onClick={() => void finMut.mutateAsync()}
            >
              Finalize
            </ActionButton>
            {variance !== 0 ? (
              <p className="mt-2 text-xs text-amber-800">Finalize is enabled only when variance is {formatCurrencyCents(0)}.</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="rounded border border-gray-200 bg-white">
        <h3 className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase text-gray-600">Linked transactions</h3>
        <ul className="divide-y divide-gray-100 text-sm">
          {txns.map((t) => (
            <li key={String(t.id)} className="px-3 py-2">
              {formatDate(String(t.transaction_date ?? ""))} · {String(t.description ?? "")} ·{" "}
              {formatCurrencyCents(Number(t.amount_cents ?? 0))}
            </li>
          ))}
        </ul>
        {!detailQuery.isLoading && txns.length === 0 ? <p className="p-4 text-sm text-gray-600">No transactions linked yet.</p> : null}
      </div>
    </div>
  );
}
