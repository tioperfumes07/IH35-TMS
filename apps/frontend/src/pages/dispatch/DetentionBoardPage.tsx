import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { useEffect, useState } from "react";
import {
  bridgeDetentionBilling,
  closeDetentionEvent,
  getDetentionBoard,
  notifyDetentionCustomer,
  syncDetentionFromArrivals,
  type DetentionBoardEvent,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";

function formatMoney(cents: number): string {
  return formatUsdCents(Math.max(0, cents));
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "—";
  const mins = Math.max(0, Math.floor((nowMs - start) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Per-row action buttons — kept as its own component (not a plain column render) so the
// close/bridge/notify mutations' hooks are scoped to a stable per-row instance, same as the
// original EventRow.
function EventActions({
  event,
  companyId,
  onAction,
}: {
  event: DetentionBoardEvent;
  companyId: string;
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

  return (
    <div className="space-x-2">
      {event.status === "accruing" ? (
        <button
          type="button"
          className="rounded-sm border px-2 py-1 text-xs"
          disabled={closeM.isPending}
          onClick={() => closeM.mutate()}
        >
          Stop accrual
        </button>
      ) : null}
      {event.status === "closed" ? (
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-700"
          disabled={bridgeM.isPending}
          onClick={() => bridgeM.mutate()}
        >
          Bridge to billing
        </button>
      ) : null}
      {event.notify_due && !event.customer_notified_at ? (
        <button
          type="button"
          className="rounded-sm border px-2 py-1 text-xs"
          disabled={notifyM.isPending}
          onClick={() => notifyM.mutate()}
        >
          Notify customer
        </button>
      ) : null}
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

  const syncM = useMutation({
    mutationFn: () => syncDetentionFromArrivals(companyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", companyId] }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", companyId] });

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const events = boardQ.data?.events ?? [];
  type DetentionRow = (typeof events)[number];

  // Migrated to the shared QBO-parity grid — columns, order, and per-row action buttons preserved
  // verbatim (§7 additive-only). Elapsed re-renders live off nowMs (30s ticker) via column render.
  const columns: Array<ParityColumn<DetentionRow>> = [
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      className: "font-medium",
      render: (event) => <EntityLink kind="load" id={event.load_id} label={event.load_number} />,
    },
    { key: "customer_name", label: "Customer", sortable: true, render: (event) => event.customer_name ?? "—" },
    {
      key: "stop_city",
      label: "Stop",
      render: (event) => (
        <>
          {[event.stop_city, event.stop_state].filter(Boolean).join(", ") || "—"}
          {event.stop_type ? <span className="ml-1 text-xs text-slate-500">({event.stop_type})</span> : null}
        </>
      ),
    },
    { key: "driver_name", label: "Driver", sortable: true, render: (event) => event.driver_name ?? "—" },
    {
      key: "started_at",
      label: "Elapsed",
      sortable: true,
      cellClass: "tabular-nums",
      render: (event) => (
        <span data-testid={`detention-elapsed-${event.id}`}>{formatElapsed(String(event.started_at), nowMs)}</span>
      ),
    },
    {
      key: "billable_minutes",
      label: "Billable",
      sortable: true,
      cellClass: "tabular-nums",
      render: (event) => `${Number(event.billable_minutes ?? 0)} min`,
    },
    {
      key: "live_accrued_amount_cents",
      label: "Accrual",
      sortable: true,
      cellClass: "tabular-nums font-medium",
      render: (event) => formatMoney(Number(event.live_accrued_amount_cents ?? event.accrued_amount_cents ?? 0)),
    },
    { key: "status", label: "Status", sortable: true, render: (event) => <StatusBadge status={String(event.status)} /> },
    {
      key: "actions",
      label: "Actions",
      alwaysVisible: true,
      render: (event) => <EventActions event={event} companyId={companyId} onAction={invalidate} />,
    },
  ];

  return (
    <div data-testid="dispatch-detention-board-page" className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Detention board"
        subtitle="Live accrual from stop arrivals · billing bridge via accessorial editor path"
        actions={
          <>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-sm"
              disabled={syncM.isPending}
              onClick={() => syncM.mutate()}
            >
              Sync from arrivals
            </button>
            <Link to="/dispatch/alerts" className="rounded-sm border px-3 py-1.5 text-sm">
              Dispatch alerts
            </Link>
          </>
        }
      />

      <p className="text-xs text-slate-600">
        Free time excluded · rate from load or customer · customer notify after{" "}
        {boardQ.data?.notify_threshold_minutes ?? 60} billable minutes.
      </p>

      <ParityTable<DetentionRow>
        columns={columns}
        rows={events}
        rowKey={(event) => String(event.id)}
        loading={boardQ.isLoading}
        emptyText="No active detention accrual. Confirmed stop arrivals will appear after sync."
        storageKey="dispatch-detention-board"
        exportFilename="detention-board"
      />
    </div>
  );
}
