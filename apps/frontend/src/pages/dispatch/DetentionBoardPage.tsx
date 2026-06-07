import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  approveDetentionRequest,
  bridgeDetentionBilling,
  closeDetentionEvent,
  getDetentionApprovalKpis,
  getDetentionBoard,
  getDetentionRequests,
  notifyDetentionCustomer,
  rejectDetentionRequest,
  syncDetentionFromArrivals,
  type DetentionBoardEvent,
  type DetentionRequest,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.max(0, cents) / 100
  );
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "—";
  const mins = Math.max(0, Math.floor((nowMs - start) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function EventRow({
  event,
  companyId,
  nowMs,
  onAction,
}: {
  event: DetentionBoardEvent;
  companyId: string;
  nowMs: number;
  onAction: () => void;
}) {
  const closeM = useMutation({
    mutationFn: () => closeDetentionEvent(event.id, { operating_company_id: companyId }),
    onSuccess: onAction,
  });
  const bridgeM = useMutation({
    mutationFn: () => bridgeDetentionBilling(event.id, { operating_company_id: companyId }),
    onSuccess: onAction,
  });
  const notifyM = useMutation({
    mutationFn: () => notifyDetentionCustomer(event.id, { operating_company_id: companyId }),
    onSuccess: onAction,
  });

  const liveCents = Number(event.live_accrued_amount_cents ?? event.accrued_amount_cents ?? 0);
  const billable = Number(event.billable_minutes ?? 0);

  return (
    <tr className="border-b last:border-b-0">
      <td className="px-3 py-2 font-medium">
        <Link to={`/dispatch?view=loads&load=${event.load_id}`} className="text-sky-700 hover:underline">
          {event.load_number}
        </Link>
      </td>
      <td className="px-3 py-2">{event.customer_name ?? "—"}</td>
      <td className="px-3 py-2">
        {[event.stop_city, event.stop_state].filter(Boolean).join(", ") || "—"}
        {event.stop_type ? <span className="ml-1 text-xs text-slate-500">({event.stop_type})</span> : null}
      </td>
      <td className="px-3 py-2">{event.driver_name ?? "—"}</td>
      <td className="px-3 py-2 tabular-nums" data-testid={`detention-elapsed-${event.id}`}>
        {formatElapsed(String(event.started_at), nowMs)}
      </td>
      <td className="px-3 py-2 tabular-nums">{billable} min</td>
      <td className="px-3 py-2 tabular-nums font-medium">{formatMoney(liveCents)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={String(event.status)} />
      </td>
      <td className="px-3 py-2 space-x-2">
        {event.status === "accruing" ? (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            disabled={closeM.isPending}
            onClick={() => closeM.mutate()}
          >
            Stop accrual
          </button>
        ) : null}
        {event.status === "closed" ? (
          <button
            type="button"
            className="rounded border border-sky-300 px-2 py-1 text-xs text-sky-800"
            disabled={bridgeM.isPending}
            onClick={() => bridgeM.mutate()}
          >
            Bridge to billing
          </button>
        ) : null}
        {event.notify_due && !event.customer_notified_at ? (
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            disabled={notifyM.isPending}
            onClick={() => notifyM.mutate()}
          >
            Notify customer
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function ApprovalRow({
  request,
  companyId,
  onAction,
}: {
  request: DetentionRequest;
  companyId: string;
  onAction: () => void;
}) {
  const [reason, setReason] = useState("");
  const approveM = useMutation({
    mutationFn: () => approveDetentionRequest(request.id, { operating_company_id: companyId }),
    onSuccess: onAction,
  });
  const rejectM = useMutation({
    mutationFn: () => rejectDetentionRequest(request.id, { operating_company_id: companyId, reason }),
    onSuccess: onAction,
  });
  const isPending = request.status === "pending_review";

  return (
    <tr className="border-b last:border-b-0" data-testid={`detention-request-${request.id}`}>
      <td className="px-3 py-2 font-medium">
        <Link to={`/dispatch?view=loads&load=${request.load_id}`} className="text-sky-700 hover:underline">
          {request.load_number}
        </Link>
      </td>
      <td className="px-3 py-2">{request.customer_name ?? "—"}</td>
      <td className="px-3 py-2">
        {[request.stop_city, request.stop_state].filter(Boolean).join(", ") || "—"}
        {request.stop_type ? <span className="ml-1 text-xs text-slate-500">({request.stop_type})</span> : null}
      </td>
      <td className="px-3 py-2 tabular-nums">{request.billable_minutes} min</td>
      <td className="px-3 py-2 tabular-nums font-medium">{formatMoney(request.amount_cents)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={request.status} />
        {request.status === "rejected" && request.rejection_reason ? (
          <span className="ml-1 text-xs text-slate-500">({request.rejection_reason})</span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {isPending ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-800"
              disabled={approveM.isPending}
              onClick={() => approveM.mutate()}
            >
              Approve &amp; invoice
            </button>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reject reason"
              className="w-32 rounded border px-2 py-1 text-xs"
              aria-label="Rejection reason"
            />
            <button
              type="button"
              className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-800"
              disabled={rejectM.isPending || reason.trim().length < 3}
              onClick={() => rejectM.mutate()}
            >
              Reject
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-500">Reviewed</span>
        )}
      </td>
    </tr>
  );
}

function KpiCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded border bg-white px-4 py-3" data-testid={testId}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  );
}

export function DetentionBoardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const boardQ = useQuery({
    queryKey: ["dispatch", "detention-board", companyId],
    queryFn: () => getDetentionBoard(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const kpisQ = useQuery({
    queryKey: ["dispatch", "detention-kpis", companyId],
    queryFn: () => getDetentionApprovalKpis(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const requestsQ = useQuery({
    queryKey: ["dispatch", "detention-requests", companyId],
    queryFn: () => getDetentionRequests(companyId),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", companyId] });
    queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-kpis", companyId] });
    queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-requests", companyId] });
  };

  const syncM = useMutation({
    mutationFn: () => syncDetentionFromArrivals(companyId),
    onSuccess: invalidate,
  });

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const events = boardQ.data?.events ?? [];

  return (
    <div data-testid="dispatch-detention-board-page" className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Detention board"
        subtitle="Live accrual from stop arrivals · billing bridge via accessorial editor path"
        actions={
          <>
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm"
              disabled={syncM.isPending}
              onClick={() => syncM.mutate()}
            >
              Sync from arrivals
            </button>
            <Link to="/dispatch/alerts" className="rounded border px-3 py-1.5 text-sm">
              Dispatch alerts
            </Link>
          </>
        }
      />

      <p className="text-xs text-slate-600">
        Free time excluded · rate from load or customer · customer notify after{" "}
        {boardQ.data?.notify_threshold_minutes ?? 60} billable minutes.
      </p>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="detention-kpi-header">
        <KpiCard
          label="Pending approval"
          value={String(kpisQ.data?.pending_count ?? 0)}
          testId="detention-kpi-pending"
        />
        <KpiCard
          label="Approved this week"
          value={formatMoney(kpisQ.data?.week_approved_cents ?? 0)}
          testId="detention-kpi-week"
        />
        <KpiCard
          label="Approved YTD"
          value={formatMoney(kpisQ.data?.ytd_approved_cents ?? 0)}
          testId="detention-kpi-ytd"
        />
      </section>

      <section className="space-y-2" data-testid="detention-approval-queue">
        <h2 className="text-sm font-semibold text-slate-700">Approval queue</h2>
        <p className="text-xs text-slate-600">
          Manager approval merges detention into the load linehaul total (bridge to billing) and builds the
          customer invoice. Approving captures dwell evidence derived from stop timestamps.
        </p>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Load</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Stop</th>
                <th className="px-3 py-2">Billable</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Decision</th>
              </tr>
            </thead>
            <tbody>
              {requestsQ.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    Loading detention requests…
                  </td>
                </tr>
              ) : (requestsQ.data?.requests ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No detention awaiting approval. Closed accruals appear here for manager review.
                  </td>
                </tr>
              ) : (
                (requestsQ.data?.requests ?? []).map((request) => (
                  <ApprovalRow
                    key={request.id}
                    request={request}
                    companyId={companyId}
                    onAction={invalidate}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Stop</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Elapsed</th>
              <th className="px-3 py-2">Billable</th>
              <th className="px-3 py-2">Accrual</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {boardQ.isLoading ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  Loading detention events…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  No active detention accrual. Confirmed stop arrivals will appear after sync.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <EventRow
                  key={String(event.id)}
                  event={event}
                  companyId={companyId}
                  nowMs={nowMs}
                  onAction={invalidate}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
