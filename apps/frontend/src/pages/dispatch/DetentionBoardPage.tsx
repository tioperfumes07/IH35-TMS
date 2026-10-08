import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useEffect, useMemo, useState } from "react";
import {
  approveDetentionRequest,
  bridgeDetentionBilling,
  closeDetentionEvent,
  DETENTION_APPROVAL_METHODS,
  getDetentionBoard,
  listDetentionApprovalRequests,
  notifyDetentionCustomer,
  rejectDetentionRequest,
  syncDetentionFromArrivals,
  type DetentionApprovalRequest,
  type DetentionBoardEvent,
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
import { DispatchSubnav } from "../../components/dispatch/DispatchSubnav";
import { serverDispatchAlertQueryFromSortState, sortDispatchAlertBoardRows } from "./dispatchAlertBoardSort";
import { SettlementReferenceCell } from "../../components/settlements/SettlementReferenceCell";
import { useSettlementReferences } from "../../hooks/useSettlementReferences";
import { SelectCombobox } from "../../components/Combobox";

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

/** ROUND 285.4.9 / #59 — pending detention approvals require METHOD before invoice print. */
function DetentionApprovalQueue({
  companyId,
}: {
  companyId: string;
}) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [methodById, setMethodById] = useState<Record<string, string>>({});

  const pendingQ = useQuery({
    queryKey: ["dispatch", "detention-approval", companyId, "pending_review"],
    queryFn: () => listDetentionApprovalRequests(companyId, "pending_review"),
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
  });

  const approveM = useMutation({
    mutationFn: (input: { id: string; method: string }) =>
      approveDetentionRequest(input.id, {
        operating_company_id: companyId,
        approval_method: input.method,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-approval", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-board", companyId] });
      pushToast("Detention approved and invoiced", "success");
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not approve detention"), "error"),
  });

  const rejectM = useMutation({
    mutationFn: (input: { id: string }) =>
      rejectDetentionRequest(input.id, {
        operating_company_id: companyId,
        reason: "Rejected from detention board",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "detention-approval", companyId] });
      pushToast("Detention request rejected", "success");
    },
    onError: (err) => pushToast(userFacingApiError(err, "Could not reject detention"), "error"),
  });

  const rows = pendingQ.data?.requests ?? [];
  if (pendingQ.isLoading) {
    return (
      <div data-testid="detention-approval-queue" className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#4B5563]">
        Loading approval queue…
      </div>
    );
  }
  if (pendingQ.isError) {
    return (
      <ListErrorState
        title="Couldn't load detention approvals"
        {...formatQueryErrorDetail(pendingQ.error)}
        onRetry={() => void pendingQ.refetch()}
      />
    );
  }
  if (rows.length === 0) return null;

  return (
    <div data-testid="detention-approval-queue" className="rounded-sm border border-[#E5E7EB] bg-white">
      <div className="border-b border-[#E5E7EB] px-3 py-2 text-section-header font-bold uppercase tracking-wide text-[#4B5563]">
        Pending approval · METHOD required for invoice
      </div>
      <ul className="divide-y divide-[#E5E7EB]">
        {rows.map((row: DetentionApprovalRequest) => {
          const method = methodById[row.id] ?? DETENTION_APPROVAL_METHODS[0];
          const stopLabel = [row.stop_city, row.stop_state].filter(Boolean).join(", ") || "—";
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-[#0F1219]">
              <span className="min-w-[4.5rem] font-semibold">{row.load_number ?? "—"}</span>
              <span className="min-w-[8rem] text-[#4B5563]">{row.customer_name ?? "—"}</span>
              <span className="min-w-[6rem] text-center">{stopLabel}</span>
              <span className="min-w-[4rem] text-center">{formatMoney(Number(row.amount_cents ?? 0))}</span>
              <label className="flex items-center gap-1">
                <span className="text-section-header font-bold uppercase text-[#4B5563]">Method</span>
                <SelectCombobox
                  className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs"
                  value={method}
                  aria-label={`Approval method for ${row.load_number ?? row.id}`}
                  onChange={(e) => setMethodById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                >
                  {DETENTION_APPROVAL_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
              <button
                type="button"
                className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs text-[#4B5563]"
                disabled={approveM.isPending || rejectM.isPending || !method.trim()}
                onClick={() => approveM.mutate({ id: row.id, method })}
              >
                Approve
              </button>
              <button
                type="button"
                className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs text-[#4B5563]"
                disabled={approveM.isPending || rejectM.isPending}
                onClick={() => rejectM.mutate({ id: row.id })}
              >
                Reject
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
          className="rounded-sm border border-[#E5E7EB] px-2 py-1 text-xs text-[#4B5563]"
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
  const [paritySortKey, setParitySortKey] = useState("started_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const serverSort = serverDispatchAlertQueryFromSortState(paritySortKey, sortDirection);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const boardQ = useQuery({
    queryKey: ["dispatch", "detention-board", companyId, range, serverSort],
    queryFn: () => getDetentionBoard(companyId, { ...range, ...serverSort }),
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

  // DSP-39 (owner 2026-09-04): this useMemo previously sat AFTER the `if (!companyId)` early
  // return below — a React hook-order violation that throws "rendered more hooks than during
  // the previous render" the moment an operator with no selected company lands here, then
  // selects one. Hooks must run unconditionally, so the memo is hoisted above every early return.
  const events = useMemo(
    () => sortDispatchAlertBoardRows(boardQ.data?.events ?? [], paritySortKey, sortDirection),
    [boardQ.data?.events, paritySortKey, sortDirection],
  );
  const settlementReferences = useSettlementReferences(companyId, events.map((event) => event.load_id));
  type DetentionRow = (typeof events)[number];

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-xs text-[#4B5563]">Select an operating company.</div>;
  }

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
    { key: "settlement_reference", label: "Settlement / Presettlement", testId: "settlement-reference-column", render: (event) => <SettlementReferenceCell reference={settlementReferences.get(event.load_id)} /> },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (event) => <EntityLinkOrTombstone kind="customer" id={event.customer_id} name={event.customer_name} noun="Customer" />,
    },
    {
      key: "stop_city",
      label: "Stop",
      sortable: true,
      render: (event) => (
        <>
          {[event.stop_city, event.stop_state].filter(Boolean).join(", ") || "—"}
          {event.stop_type ? <span className="ml-1 text-xs text-[#6B7280]">({event.stop_type})</span> : null}
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
      sortable: true,
      cellClass: "tabular-nums",
      render: (event) => `${Number(event.billable_minutes ?? 0)} min`,
    },
    {
      key: "live_accrued_amount_cents",
      label: "Estimated / unbilled",
      sortable: true,
      cellClass: "tabular-nums font-medium",
      render: (event) => formatMoney(Number(event.live_accrued_amount_cents ?? event.accrued_amount_cents ?? 0)),
    },
    {
      key: "operational_state",
      label: "Detention status",
      sortable: true,
      render: (event) => <StatusBadge status={operationalStateLabel(event.operational_state)} />,
    },
    {
      key: "billing_state",
      label: "Customer balance",
      sortable: true,
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
      {/* DSP-05 (owner 2026-09-04): the Detention page mounted a bare PageHeader, so the
          dispatch queue sub-nav AND the "Dispatch › Detention" breadcrumb were absent —
          the operator lost the tab bar the moment they opened this queue. DispatchSubnav
          renders both (dispatch-queues-subnav + dispatch-breadcrumb) and its own hooks are
          self-contained, so it does not affect this page's hook order. */}
      <DispatchSubnav operatingCompanyId={companyId} />
      <PageHeader
        title="Detention board"
        subtitle="Operational detention and stopped, unbilled customer receivables · independent of load status"
        actions={
          <>
            <button
              type="button"
              className="rounded-sm border px-3 py-1.5 text-xs"
              disabled={syncM.isPending}
              onClick={() => syncM.mutate(companyId)}
            >
              Sync from arrivals
            </button>
            <Link to="/dispatch/alerts" className="rounded-sm border px-3 py-1.5 text-xs">
              Dispatch alerts
            </Link>
          </>
        }
      />

      <DispatchAlertServerControls value={range} onApply={setRange} />

      <DetentionApprovalQueue companyId={companyId} />

      <p className="text-xs text-[#4B5563]">
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
        <ParityTable<DetentionRow> appearance="board"
        columns={columns}
        rows={events}
        rowKey={(event) => String(event.id)}
        loading={boardQ.isLoading}
        emptyText="No active detention accrual. Confirmed stop arrivals will appear after sync."
        storageKey="dispatch-detention-board"
        exportFilename="detention-board"
        suppressToolbarRange
        sortKey={paritySortKey}
        sortDirection={sortDirection}
        sortMode="external"
        onSortChange={(key, direction) => {
          setParitySortKey(key);
          setSortDirection(direction);
        }}
        />
      )}
    </div>
  );
}
