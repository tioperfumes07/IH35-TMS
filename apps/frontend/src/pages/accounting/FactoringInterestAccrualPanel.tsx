// Lead ROUND 296 — Faro Default Interest posts once, at month-end close, with approval (DR 6830 / CR 2155), never at night.
// The panel shows the month's computed lines (0.067%/day compounded from day 36 on each open Purchased Account's Net
// Amount, less what earlier months already accrued). One user proposes; a DIFFERENT user approves (the server and the
// database both refuse the proposer) and only then does one journal entry post. Reject posts nothing.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideInterestAccrual,
  getInterestAccrualPreview,
  getInterestAccrualRuns,
  proposeInterestAccrual,
  type InterestAccrualLine,
} from "../../api/factoring-interest-accrual";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

const columns: Array<ParityColumn<InterestAccrualLine>> = [
  {
    key: "invoice_display_id",
    label: "Invoice",
    sortable: true,
    render: (r) => <EntityLink kind="invoice" id={r.invoice_id} label={r.invoice_display_id ?? "Invoice"} />,
  },
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    render: (r) =>
      r.customer_id ? <EntityLink kind="customer" id={r.customer_id} label={entityLabel(r.customer_name, r.customer_id, "Customer")} /> : "—",
  },
  {
    key: "purchase_display_id",
    label: "Purchase",
    sortable: true,
    render: (r) => <EntityLink kind="factoring_purchase" id={r.purchase_id} label={r.purchase_display_id ?? "Purchase"} />,
  },
  { key: "purchase_date", label: "Purchased", sortable: true, render: (r) => formatDateUS(r.purchase_date) },
  { key: "net_cents", label: "Net amount", kind: "money", sortable: true, render: (r) => formatUsdCents(r.net_cents) },
  { key: "days_charged", label: "Days charged", kind: "number", sortable: true, render: (r) => String(r.days_charged) },
  { key: "cumulative_interest_cents", label: "Interest to date", kind: "money", sortable: true, render: (r) => formatUsdCents(r.cumulative_interest_cents) },
  { key: "previously_accrued_cents", label: "Already accrued", kind: "money", sortable: true, render: (r) => formatUsdCents(r.previously_accrued_cents) },
  { key: "accrual_cents", label: "This month", kind: "money", sortable: true, render: (r) => formatUsdCents(r.accrual_cents) },
];

export function FactoringInterestAccrualPanel({ companyId, period }: { companyId: string; period: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["factoring", "interest-accrual", "preview", companyId, period],
    queryFn: () => getInterestAccrualPreview(companyId, period),
    enabled: Boolean(companyId && period),
  });
  const runs = useQuery({
    queryKey: ["factoring", "interest-accrual", "runs", companyId],
    queryFn: () => getInterestAccrualRuns(companyId),
    enabled: Boolean(companyId),
  });
  const periodEnd = preview.data?.period_end;
  const live = (runs.data ?? []).find((r) => (r.run_kind ?? "period_close") === "period_close" && r.period_end === periodEnd && r.state !== "rejected") ?? null;
  // Owner ruling 2026-10-02: interest also accrues at collection / repurchase — one-invoice event runs, same approval path.
  const pendingEvents = (runs.data ?? []).filter((r) => r.run_kind === "event" && r.state === "proposed");

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["factoring", "interest-accrual"] });
      await queryClient.invalidateQueries({ queryKey: ["accounting", "month-close", companyId, period] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const lines = preview.data?.lines ?? [];
  return (
    <DataPanel title="Faro default interest — month-end accrual (DR 6830 / CR 2155)">
      {preview.isError ? (
        <ListErrorState title="Couldn't compute the interest accrual" status={0} message={(preview.error as Error | undefined)?.message} onRetry={() => void preview.refetch()} />
      ) : (
        <ParityTable<InterestAccrualLine>
          columns={columns}
          rows={lines}
          rowKey={(r) => r.purchase_line_id}
          loading={preview.isLoading}
          emptyText="No factored invoice is past day 35 at this period end — no default interest is due."
          storageKey="month-close-faro-interest"
          tableTestId="month-close-faro-interest-table"
        />
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#1F2A44]">
        <span className="tabular-nums" data-testid="faro-interest-run-status">
          {live
            ? live.state === "posted"
              ? `Posted ${formatUsdCents(live.total_cents)} (${live.line_count} invoices) — journal entry ${live.journal_entry_id ?? ""}`
              : `Proposed ${formatUsdCents(live.total_cents)} (${live.line_count} invoices) on ${formatDateUS(live.proposed_at)} — awaiting a second person's approval`
            : `Due this month: ${formatUsdCents(preview.data?.total_cents ?? 0)}`}
        </span>
        <span className="inline-flex gap-2">
          {!live && lines.length > 0 ? (
            <Button size="sm" loading={busy} onClick={() => void act(() => proposeInterestAccrual(companyId, period))}>
              Propose accrual
            </Button>
          ) : null}
          {live?.state === "proposed" ? (
            live.proposed_by_user_id === user?.uuid ? (
              <span className="text-[#4B5563]">You proposed this run — a different person approves it.</span>
            ) : (
              <>
                <Button size="sm" loading={busy} onClick={() => void act(() => decideInterestAccrual(companyId, live.id, "approve"))}>
                  Approve and post
                </Button>
                <Button size="sm" variant="secondary" loading={busy} onClick={() => void act(() => decideInterestAccrual(companyId, live.id, "reject"))}>
                  Reject
                </Button>
              </>
            )
          ) : null}
        </span>
      </div>
      {pendingEvents.length ? (
        <div className="mt-3 text-xs text-[#1F2A44]" data-testid="faro-interest-event-runs">
          <div className="mb-1 font-semibold uppercase text-[#4B5563]">Interest at collection / repurchase — awaiting approval</div>
          <ul className="space-y-1">
            {pendingEvents.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>
                  {r.event_invoice_id ? (
                    <EntityLink kind="invoice" id={r.event_invoice_id} label={r.event_invoice_display_id ?? "Invoice"} />
                  ) : (
                    "Invoice"
                  )}
                  {r.event_faro_invoice_number ? ` (Faro Inv ${r.event_faro_invoice_number})` : ""} · through {formatDateUS(r.period_end)} ·{" "}
                  {formatUsdCents(r.total_cents)}
                </span>
                {r.proposed_by_user_id === user?.uuid ? (
                  <span className="text-[#4B5563]">You proposed this — a different person approves it.</span>
                ) : (
                  <span className="inline-flex gap-2">
                    <Button size="sm" loading={busy} onClick={() => void act(() => decideInterestAccrual(companyId, r.id, "approve"))}>
                      Approve and post
                    </Button>
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => void act(() => decideInterestAccrual(companyId, r.id, "reject"))}>
                      Reject
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
    </DataPanel>
  );
}
