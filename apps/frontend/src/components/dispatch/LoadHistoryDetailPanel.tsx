/**
 * Row 78 — Dispatch › Load history: the selected load's panel ("Load 13689 — everything linked to it").
 * Three blocks, all from existing engines (no second engine):
 *   Timeline        GET /api/v1/dispatch/loads/:id/history (load audit + assignment history + stop stamps + linked docs)
 *   Money           GET /api/v1/accounting/loads/:id/cost-rollup (the ONE canonical per-load rollup)
 *   Linked records  the list row (customer · driver · truck · trailer · invoice · advance · settlement)
 *                   + the history's linked documents (invoices, advances, settlement lines, expenses, work orders)
 *                   + GET /api/v1/loads/:id/expenses (fuel and other expenses on the load)
 *                   + GET /api/v1/docs/files?entity_type=load (rate confirmation · BOL · POD · other documents)
 * Every item opens its record, and every record links back to this load.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getLoadCostRollup, listLoadExpenses } from "../../api/accounting";
import { listFiles } from "../../api/docs";
import { getDispatchLoadHistory, type LoadHistoryRow } from "../../api/loads";
import type { LoadsHistoryRow } from "../../api/reports";
import { entityLabel } from "../../lib/entity-label";
import { formatCompanyName } from "../../lib/formatCompanyName";
import { formatDateUS } from "../../lib/formatDate";
import { formatPersonName } from "../../lib/formatPersonName";
import { loadStatusLabel } from "../../lib/load-status";
import { formatUsdCents } from "../../lib/money";
import { EntityLink, type EntityKind } from "../shared/EntityLink";

/** Linked-record chips shown beside one timeline event. */
const MAX_EVENT_LINKS = 3;

/** Timeline kinds the panel shows as milestones (field edits stay on the full change history page). */
export const PANEL_TIMELINE_KINDS: ReadonlyArray<LoadHistoryRow["kind"]> = [
  "status_transition",
  "assignment",
  "stop_stamp",
  "linked_document",
  "gap",
];

export function panelTimeline(rows: LoadHistoryRow[]): LoadHistoryRow[] {
  return rows.filter((r) => PANEL_TIMELINE_KINDS.includes(r.kind));
}

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms === 0) return "not recorded";
  return formatDateUS(iso) || "—";
}

const DOC_KIND: Record<string, EntityKind> = {
  invoice: "invoice",
  factoring_advance: "factoring_advance",
  settlement_line: "settlement",
  expense: "expense",
  work_order: "work_order",
};

const LINK_KINDS = new Set<string>(["load", "driver", "unit", "trailer", "customer", "invoice", "factoring_advance", "settlement", "expense", "work_order", "user"]);

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#F1F3F6] py-1 text-xs" data-testid={testId}>
      <span className="shrink-0 font-semibold text-[#4B5563]">{label}</span>
      <span className="min-w-0 text-right text-[#111827]">{children}</span>
    </div>
  );
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="border-t border-[#E5E7EB] px-3 py-2" data-testid={testId}>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">{title}</h3>
      {children}
    </section>
  );
}

export function LoadHistoryDetailPanel({
  row,
  operatingCompanyId,
  onClose,
  onOpenLoad,
}: {
  row: LoadsHistoryRow;
  operatingCompanyId: string;
  onClose: () => void;
  onOpenLoad: (loadId: string) => void;
}) {
  const loadId = row.load_id;
  const enabled = Boolean(loadId && operatingCompanyId);
  const history = useQuery({
    queryKey: ["dispatch-load-history", operatingCompanyId, loadId],
    queryFn: () => getDispatchLoadHistory(loadId, operatingCompanyId),
    enabled,
  });
  const rollup = useQuery({
    queryKey: ["load-cost-rollup", operatingCompanyId, loadId],
    queryFn: () => getLoadCostRollup(operatingCompanyId, loadId),
    enabled,
  });
  const expenses = useQuery({
    queryKey: ["load-expenses", operatingCompanyId, loadId, "load-history-panel"],
    queryFn: () => listLoadExpenses(operatingCompanyId, loadId, { limit: 100 }),
    enabled,
  });
  const files = useQuery({
    queryKey: ["docs-files", operatingCompanyId, "load", loadId],
    queryFn: () => listFiles({ operating_company_id: operatingCompanyId, entity_type: "load", entity_id: loadId, limit: 100 }),
    enabled,
  });

  const timeline = panelTimeline(history.data?.rows ?? []);
  const linkedDocs = history.data?.linked_documents ?? [];
  const money = rollup.data;
  const loadLabel = entityLabel(row.load_number, loadId, "Load");

  return (
    <aside className="flex min-w-0 flex-col rounded-sm border border-[#E5E7EB] bg-white" data-testid="load-history-detail-panel" aria-label={`Load ${loadLabel}`}>
      <header className="flex items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#111827]">
            Load <EntityLink kind="load" id={loadId} label={loadLabel} /> — everything linked to it
          </div>
          <div className="text-xs text-[#6B7280]">
            {loadStatusLabel(row.status)} · {row.trip_type ?? "—"} · every item opens its record
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs font-medium text-[#1F2A44]"
            onClick={() => onOpenLoad(loadId)}
            data-testid="load-history-panel-open-load"
          >
            Open load
          </button>
          <button type="button" className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs" onClick={onClose} aria-label="Close panel" data-testid="load-history-panel-close">
            ×
          </button>
        </div>
      </header>

      <Section title="Timeline" testId="load-history-panel-timeline">
        {history.isError ? <p className="text-xs text-[#B91C1C]">Could not load this load's history.</p> : null}
        {history.isPending ? <p className="text-xs text-[#6B7280]">Loading…</p> : null}
        {!history.isPending && timeline.length === 0 ? <p className="text-xs text-[#6B7280]">No history events recorded for this load.</p> : null}
        <ol className="space-y-1">
          {timeline.map((ev) => (
            <li key={ev.id} className="flex gap-2 text-xs" data-testid="load-history-panel-event">
              <span className="w-20 shrink-0 whitespace-nowrap text-[#6B7280]">{when(ev.occurred_at)}</span>
              <span className="min-w-0 text-[#1F2A44]">
                {ev.summary}
                {ev.links.filter((l) => LINK_KINDS.has(l.kind)).length > 0 ? (
                  <span className="ml-1 inline-flex flex-wrap gap-1">
                    {ev.links
                      .filter((l) => LINK_KINDS.has(l.kind) && l.id !== loadId)
                      .slice(0, MAX_EVENT_LINKS)
                      .map((l) => (
                        <EntityLink key={`${l.kind}:${l.id}`} kind={l.kind as EntityKind} id={l.id} label={l.label ?? undefined} />
                      ))}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        <Link to={`/dispatch/loads/${encodeURIComponent(loadId)}/history`} className="mt-1 inline-block text-xs font-semibold text-[#1F2A44] hover:underline" data-testid="load-history-panel-full-history">
          Full change history →
        </Link>
      </Section>

      <Section title="Money on this load" testId="load-history-panel-money">
        {rollup.isError ? <p className="text-xs text-[#B91C1C]">Could not load the load-cost rollup.</p> : null}
        <Row label="Revenue">
          {row.invoice_id ? <EntityLink kind="invoice" id={row.invoice_id} label={`invoice ${entityLabel(row.invoice_number, row.invoice_id, "Invoice")}`} /> : "not invoiced"}
          {" · "}
          {money ? formatUsdCents(money.revenue_cents) : "…"}
        </Row>
        <Row label="Driver pay">
          {row.settlement_id ? <EntityLink kind="settlement" id={row.settlement_id} label={entityLabel(row.settlement_number, row.settlement_id, "Settlement")} /> : row.settlement_number ?? "no settlement"}
          {" · "}
          {money ? formatUsdCents(-money.driver_pay_cents) : "…"}
        </Row>
        <Row label="Fuel on this load">{money ? formatUsdCents(-money.fuel_cents) : "…"}</Row>
        <Row label="Other expenses">{money ? formatUsdCents(-money.expenses_cents) : "…"}</Row>
        <Row label="Load margin" testId="load-history-panel-margin">
          <strong>{money ? formatUsdCents(money.margin_cents) : "…"}</strong>
          {money?.margin_pct != null ? <span className="ml-1 text-[#6B7280]">({money.margin_pct.toFixed(1)}%)</span> : null}
        </Row>
        <Link to={`/dispatch/load-costs/${encodeURIComponent(loadId)}`} className="mt-1 inline-block text-xs font-semibold text-[#1F2A44] hover:underline">
          Open load costs →
        </Link>
      </Section>

      <Section title="Linked records" testId="load-history-panel-links">
        <Row label="Customer">
          <EntityLink kind="customer" id={row.customer_id} label={row.customer_name ? formatCompanyName(row.customer_name) : entityLabel(null, row.customer_id, "Customer")} />
        </Row>
        <Row label="Driver">
          {row.driver_id ? <EntityLink kind="driver" id={row.driver_id} label={row.driver_name ? formatPersonName(row.driver_name) : entityLabel(null, row.driver_id, "Driver")} /> : "—"}
        </Row>
        <Row label="Truck / trailer">
          {row.unit_id ? <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} /> : "—"}
          {" · "}
          {row.trailer_id ? <EntityLink kind="trailer" id={row.trailer_id} label={entityLabel(row.trailer_number, row.trailer_id, "Trailer")} /> : row.trailer_number ?? "no trailer"}
        </Row>
        <Row label="Factoring">
          {row.factoring_advance_id ? (
            <EntityLink kind="factoring_advance" id={row.factoring_advance_id} label={entityLabel(row.factoring_display, row.factoring_advance_id, "Advance")} />
          ) : (
            "not factored"
          )}
        </Row>
        {linkedDocs.map((d) => (
          <Row key={`${d.kind}:${d.id}`} label={d.kind.replace(/_/g, " ")} testId="load-history-panel-linked-doc">
            <EntityLink kind={DOC_KIND[d.kind] ?? "load"} id={d.id} label={entityLabel(d.display_id, d.id, "Record")} />
            {d.status ? <span className="ml-1 text-[#6B7280]">{d.status}</span> : null}
            {d.amount_cents != null ? <span className="ml-1">{formatUsdCents(d.amount_cents)}</span> : null}
          </Row>
        ))}
        <Row label={`Expenses & fuel (${expenses.data?.total ?? expenses.data?.rows.length ?? 0})`} testId="load-history-panel-expenses">
          {(expenses.data?.rows ?? []).length === 0 ? (
            expenses.isPending ? "…" : "none"
          ) : (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {(expenses.data?.rows ?? []).slice(0, 8).map((e) => (
                <EntityLink key={e.id} kind="expense" id={e.id} label={`${entityLabel(e.expense_number, e.id, "Expense")} ${formatUsdCents(Number(e.total_amount_cents))}`} />
              ))}
            </span>
          )}
        </Row>
        <Row label={`Documents (${files.data?.total ?? files.data?.files.length ?? 0})`} testId="load-history-panel-documents">
          {(files.data?.files ?? []).length === 0 ? (
            files.isPending ? "…" : "none on file"
          ) : (
            <span className="inline-flex flex-col items-end gap-0.5">
              {(files.data?.files ?? []).slice(0, 8).map((f) => (
                <EntityLink key={f.id} kind="document" id={f.id} label={`${f.category_label ?? "Document"} · ${f.original_filename}`} />
              ))}
            </span>
          )}
        </Row>
      </Section>
    </aside>
  );
}
