import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useEffect, useState } from "react";
import {
  bridgeDetentionBilling,
  closeDetentionEvent,
  getDetentionBoard,
  notifyDetentionCustomer,
  syncDetentionFromArrivals,
  type DetentionBoardEvent,
  type DispatchAlertQuery,
} from "../../api/dispatch";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatUsdCents } from "../../lib/money";
import { ListErrorState } from "../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { DispatchAlertServerControls, type DispatchAlertRange } from "../../components/dispatch/DispatchAlertServerControls";

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

function operationalStateLabel(state: DetentionBoardEvent["operational_state"]): string {
  return state === "active" ? "Accruing" : "Stopped";
}

function billingStateLabel(state: DetentionBoardEvent["billing_state"]): string {
  if (state === "billed") return "Billed";
  return state === "unbilled_receivable" ? "Unbilled receivable" : "Estimated, not yet owed";
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
  onAction: (submittedCompanyId: string) => void;
}) {
  const { pushToast } = useToast();
  type DetentionAction = { eventId: string; companyId: string };
  // DISP-F6326: none of this row's 3 mutations (nor the board's syncM) had onError — no toast
  // import anywhere in the file, no isError check, all fire-and-forget .mutate(). A rejected
  // close/bridge/notify silently did nothing: no error, no explanation, the button just went
  // back to enabled with zero feedback.
  const closeM = useMutation({
    mutationFn: ({ eventId, companyId: submittedCompanyId }: DetentionAction) =>
      closeDetentionEvent(eventId, { operating_company_id: submittedCompanyId }),
    onSuccess: (_result, variables) => onAction(variables.companyId),
    onError: (err) => pushToast(userFacingApiError(err, "Could not stop the detention accrual"), "error"),
  });
  const bridgeM = useMutation({
    mutationFn: ({ eventId, companyId: submittedCompanyId }: DetentionAction) =>
      bridgeDetentionBilling(eventId, { operating_company_id: submittedCompanyId }),
    onSuccess: (_result, variables) => onAction(variables.companyId),
    onError: (err) => pushToast(userFacingApiError(err, "Could not bridge detention to billing"), "error"),
  });
  const notifyM = useMutation({
    mutationFn: ({ eventId, companyId: submittedCompanyId }: DetentionAction) =>
      notifyDetentionCustomer(eventId, { operating_company_id: submittedCompanyId }),
    onSuccess: (_result, variables) => onAction(variables.companyId),
    onError: (err) => pushToast(userFacingApiError(err, "Could not notify the customer"), "error"),
  });

  const actionPending = closeM.isPending || bridgeM.isPending || notifyM.isPending;
  const actionVariables = { eventId: event.id, companyId };

  return (
    <div className="space-x-2">
      {event.status === "accruing" ? (
        <button
          type="button"
          className="rounded-sm border px-2 py-1 text-xs"
          disabled={actionPending}
          onClick={() => closeM.mutate(actionVariables)}
        >
          Stop accrual
        </button>
      ) : null}
      {event.status === "closed" ? (
        <button
          type="button"
          className="rounded-sm border border-slate-300 px-2 py-1 text-xs text-slate-700"
          disabled={actionPending}
          onClick={() => bridgeM.mutate(actionVariables)}
        >
          Bridge to billing
        </button>
      ) : null}
      {event.notify_due && !event.customer_notified_at ? (
        <button
          type="button"
          className="rounded-sm border px-2 py-1 text-xs"
          disabled={actionPending}
          onClick={() => notifyM.mutate(actionVariables)}
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
  const { pushToast } = useToast();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [range, setRange] = useState<DispatchAlertRange>({ from: "", to: "" });
  const [sort, setSort] = useState<Required<Pick<DispatchAlertQuery, "sort" | "direction">>>({ sort: "event_at", direction: "asc" });

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const boardQ = useQuery({
    queryKey: ["dispatch", "detention-board", companyId, range, sort],
    queryFn: () => getDetentionBoard(companyId, { ...range, ...sort }),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  // DISP-F6326: see EventActions above — same file-wide gap.
  const syncM = useMutation({
    mutationFn: (submittedCompanyId: string) => syncDetentionFromArrivals(submittedCompanyId),
    onSuccess: (_result, submittedCompanyId) =>
      queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", submittedCompanyId] }),
    onError: (err) => pushToast(userFacingApiError(err, "Could not sync detention from arrivals"), "error"),
  });

  const invalidate = (submittedCompanyId: string) =>
    queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", submittedCompanyId] });

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
      render: (event) => <EntityLinkOrTombstone kind="load" id={event.load_id} name={event.load_number} noun="Load" />,
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (event) => <EntityLinkOrTombstone kind="customer" id={event.customer_id} name={event.customer_name} noun="Customer" />,
    },
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
    {
      key: "driver_name",
      label: "Driver",
      sortable: true,
      render: (event) => <EntityLinkOrTombstone kind="driver" id={event.driver_id} name={event.driver_name} noun="Driver" />,
    },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (event) => <EntityLinkOrTombstone kind="unit" id={event.unit_id} name={event.unit_number} noun="Unit" />,
    },
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
      cellClass: "tabular-nums",
      render: (event) => `${Number(event.billable_minutes ?? 0)} min`,
    },
    {
      key: "live_accrued_amount_cents",
      label: "Estimated / unbilled",
      cellClass: "tabular-nums font-medium",
      render: (event) => formatMoney(Number(event.live_accrued_amount_cents ?? event.accrued_amount_cents ?? 0)),
    },
    {
      key: "operational_state",
      label: "Detention status",
      render: (event) => <StatusBadge status={operationalStateLabel(event.operational_state)} />,
    },
    {
      key: "billing_state",
      label: "Customer balance",
      render: (event) => <StatusBadge status={billingStateLabel(event.billing_state)} />,
    },
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
        subtitle="Operational detention and stopped, unbilled customer receivables · independent of load status"
        actions={
          <>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-sm"
              disabled={syncM.isPending}
              onClick={() => syncM.mutate(companyId)}
            >
              Sync from arrivals
            </button>
            <Link to="/dispatch/alerts" className="rounded-sm border px-3 py-1.5 text-sm">
              Dispatch alerts
            </Link>
          </>
        }
      />

      <DispatchAlertServerControls value={range} onApply={setRange} />

      <p className="text-xs text-slate-600">
        Active rows are estimates, not customer balances · stopped rows remain visible as unbilled receivables · customer notify after{" "}
        {boardQ.data?.notify_threshold_minutes ?? 60} billable minutes.
      </p>

      {boardQ.isError ? (
        <ListErrorState
          title="Couldn't load detention events"
          {...formatQueryErrorDetail(boardQ.error)}
          onRetry={() => void boardQ.refetch()}
        />
      ) : (
        <ParityTable<DetentionRow>
        columns={columns}
        rows={events}
        rowKey={(event) => String(event.id)}
        loading={boardQ.isLoading}
        emptyText="No active detention accrual. Confirmed stop arrivals will appear after sync."
        storageKey="dispatch-detention-board"
        exportFilename="detention-board"
        suppressToolbarRange
        sortKey={sort.sort === "event_at" ? "started_at" : (sort.sort ?? "started_at")}
        sortDirection={sort.direction}
        sortMode="external"
        onSortChange={(key, direction) => setSort({ sort: key === "started_at" ? "event_at" : key as NonNullable<DispatchAlertQuery["sort"]>, direction })}
        />
      )}
    </div>
  );
}
