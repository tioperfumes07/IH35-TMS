// Lead ROUND 296 / 297 + owner (2026-10-02): "WHEN RECOURSE TIME ARRIVES IT MUST ASK, NOT RECOURSE AUTOMATICALLY."
// Faro's 95-day Repurchase Deadline, as the owner's decision queue. Each row is a purchased invoice still open on its
// due date. The owner answers EXTEND (a new date — it asks again then), CONFIRM REPURCHASE (the repurchase posts when
// Faro's deduction or our payment is matched in Banking), or MARK COLLECTED (the customer paid Faro). No default
// action, and nothing posts from this panel. Renders nothing when no deadline is waiting.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideRepurchaseDue,
  getRepurchaseDue,
  type RepurchaseDueDecision,
  type RepurchaseDueRow,
} from "../../api/factoring-repurchase-due";
import { DataPanel } from "../../components/layout/DataPanel";
import { DatePicker } from "../../components/forms/DatePicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { Modal } from "../../components/Modal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { formatDateUS } from "../../lib/formatDate";

const ACTION = "rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-slate-700 disabled:opacity-50";

export function RepurchaseDuePanel({ companyId, isOwner }: { companyId: string; isOwner: boolean }) {
  const queryClient = useQueryClient();
  const [extending, setExtending] = useState<RepurchaseDueRow | null>(null);
  const [extendTo, setExtendTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["factoring", "repurchase-due", companyId],
    queryFn: () => getRepurchaseDue(companyId),
    enabled: Boolean(companyId),
  });

  async function decide(row: RepurchaseDueRow, decision: RepurchaseDueDecision, extended_to?: string) {
    setBusy(row.id);
    setError(null);
    try {
      await decideRepurchaseDue(companyId, row.id, decision, extended_to ? { extended_to } : {});
      setExtending(null);
      await queryClient.invalidateQueries({ queryKey: ["factoring", "repurchase-due", companyId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const columns: Array<ParityColumn<RepurchaseDueRow>> = [
    {
      key: "invoice_display_id",
      label: "Invoice",
      sortable: true,
      render: (row) => <EntityLink kind="invoice" id={row.invoice_id} label={row.invoice_display_id ?? "Invoice"} />,
    },
    {
      key: "customer_name",
      label: "Customer",
      sortable: true,
      render: (row) =>
        row.customer_id ? (
          <EntityLink kind="customer" id={row.customer_id} label={entityLabel(row.customer_name, row.customer_id, "Customer")} />
        ) : (
          "—"
        ),
    },
    {
      key: "factor_name",
      label: "Factor",
      sortable: true,
      render: (row) =>
        row.factor_vendor_id ? (
          <EntityLink kind="vendor" id={row.factor_vendor_id} label={entityLabel(row.factor_name, row.factor_vendor_id, "Vendor")} />
        ) : (
          "—"
        ),
    },
    {
      key: "purchase_display_id",
      label: "Purchase",
      sortable: true,
      render: (row) => <EntityLink kind="factoring_purchase" id={row.purchase_id} label={row.purchase_display_id ?? "Purchase"} />,
    },
    { key: "purchase_date", label: "Purchased", sortable: true, render: (row) => formatDateUS(row.purchase_date) },
    { key: "due_date", label: "Repurchase due", sortable: true, render: (row) => formatDateUS(row.due_date) },
    { key: "days_since_purchase", label: "Days", kind: "number", sortable: true, render: (row) => String(row.days_since_purchase) },
    { key: "gross_cents", label: "Face", kind: "money", sortable: true, render: (row) => formatUsdCents(row.gross_cents) },
    {
      key: "decide",
      label: "Decide",
      render: (row) =>
        isOwner ? (
          <span className="inline-flex gap-1">
            <button type="button" className={ACTION} disabled={busy === row.id} onClick={() => { setExtendTo(""); setExtending(row); }}>
              Extend
            </button>
            <button type="button" className={ACTION} disabled={busy === row.id} onClick={() => void decide(row, "confirm_repurchase")}>
              Confirm repurchase
            </button>
            <button type="button" className={ACTION} disabled={busy === row.id} onClick={() => void decide(row, "mark_collected")}>
              Mark collected
            </button>
          </span>
        ) : (
          <span className="text-slate-600">Awaiting owner</span>
        ),
    },
  ];

  const rows = query.data?.rows ?? [];
  if (!query.isError && rows.length === 0) return null;

  return (
    <DataPanel title={`Repurchase deadline — ${rows.length} awaiting your decision`}>
      <p className="mb-2 text-xs text-slate-700">
        Faro's 95-day repurchase deadline has arrived for these invoices. Nothing posts until you decide.
      </p>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load repurchase deadlines"
          status={0}
          message={(query.error as Error | undefined)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<RepurchaseDueRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          emptyText="No repurchase deadline is waiting."
          storageKey="factoring-repurchase-due"
          tableTestId="factoring-repurchase-due-table"
        />
      )}
      {error ? <p className="mt-2 text-xs text-red-700" role="alert">{error}</p> : null}
      {extending ? (
        <Modal open onClose={() => setExtending(null)} title={`Extend — ${extending.invoice_display_id ?? "Invoice"}`}>
          <label className="block text-xs font-medium text-slate-700">New repurchase date (after {formatDateUS(extending.due_date)})</label>
          <DatePicker value={extendTo} onChange={setExtendTo} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={ACTION} onClick={() => setExtending(null)}>Cancel</button>
            <button
              type="button"
              className={ACTION}
              disabled={!extendTo || extendTo <= extending.due_date || busy === extending.id}
              onClick={() => void decide(extending, "extend", extendTo)}
            >
              Extend
            </button>
          </div>
        </Modal>
      ) : null}
    </DataPanel>
  );
}
