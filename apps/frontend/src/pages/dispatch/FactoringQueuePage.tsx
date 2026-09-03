/**
 * FactoringQueuePage — Dispatch-side factoring packet queue.
 * Standalone page — Lane A wires route + sidebar entry (/dispatch/factoring-queue).
 *
 * Shows loads grouped by factoring lifecycle stage with action shortcuts.
 * Uses GET /api/v1/dispatch/factoring-queue (factoring-queue.routes.ts).
 * FARO Reserve summary strip reuses existing factoring summary API.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink } from "../../components/shared/EntityLink";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFactoringSummary } from "../../api/factoring";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useListState } from "../../components/list-state";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useStagedListFilters } from "../../components/table";
import { entityLabel } from "../../lib/entity-label";

const EMPTY_FILTERS = {
  customerId: "",
  loadId: "",
};

// ─── types ────────────────────────────────────────────────────────────────────

export type FactoringQueueRow = {
  load_id: string;
  load_number: string;
  customer_id: string;
  customer_name: string | null;
  load_status: string;
  rate_total_cents: number;
  currency_code: string;
  packet_stage: "NOT_FACTORED" | "PACKET_READY" | "SUBMITTED" | "ADVANCE_RECEIVED" | "RESERVE_RELEASED" | "CHARGED_BACK";
  packet_generated_at: string | null;
  packet_approved_at: string | null;
  invoice_id: string | null;
  invoice_display_id: string | null;
  invoice_factoring_status: string | null;
  missing_doc_types: string[];
  delivery_city: string | null;
  delivery_state: string | null;
  delivered_at: string | null;
};

type QueueResponse = {
  rows: FactoringQueueRow[];
  total: number;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const fmtM = (cents: number, currency = "USD") => {
  const fmt = currency === "MXN"
    ? new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
    : money;
  return fmt.format((Number(cents) || 0) / 100);
};
const fmtD = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const STAGE_LABELS: Record<FactoringQueueRow["packet_stage"], string> = {
  NOT_FACTORED: "Not Factored",
  PACKET_READY: "Packet Ready",
  SUBMITTED: "Submitted",
  ADVANCE_RECEIVED: "Advance Received",
  RESERVE_RELEASED: "Released",
  CHARGED_BACK: "Charged Back",
};

const STAGE_PILL: Record<FactoringQueueRow["packet_stage"], string> = {
  NOT_FACTORED: "bg-gray-100 text-gray-600 border-gray-200",
  PACKET_READY: "bg-slate-100 text-slate-700 border-slate-300",
  SUBMITTED: "bg-slate-100 text-slate-700 border-slate-200",
  ADVANCE_RECEIVED: "bg-slate-100 text-slate-700 border-slate-200",
  RESERVE_RELEASED: "bg-slate-100 text-slate-700 border-slate-200",
  CHARGED_BACK: "bg-red-50 text-red-700 border-red-200",
};

const ALL_STAGES = [
  "ALL",
  "NOT_FACTORED",
  "PACKET_READY",
  "SUBMITTED",
  "ADVANCE_RECEIVED",
  "RESERVE_RELEASED",
  "CHARGED_BACK",
] as const;

type StageFilter = (typeof ALL_STAGES)[number];

// ─── component ────────────────────────────────────────────────────────────────

export function FactoringQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");

  // LINK-F5171/LINK-F5179 — reverse_link: CustomerDetail/FactoringTab now link here as
  // ?customer_id=/?queue_record_id=; legacy ?load_id= bookmarks remain readable.
  // LST-F5163O — visible EntityPicker filters (URL-only is not reverse chrome).
  // LV-DISPATCH-FACTORING-QUEUE-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdFromUrl = searchParams.get("customer_id")?.trim() ?? "";
  const loadIdFromUrl =
    (searchParams.get("queue_record_id") ?? searchParams.get("load_id"))?.trim() ?? "";

  function patchListSearchParam(next: { customerId: string; loadId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.customerId) p.set("customer_id", next.customerId);
    else p.delete("customer_id");
    // LST-F5196 — write load_id; clear legacy queue_record_id alias.
    if (next.loadId) {
      p.set("load_id", next.loadId);
      p.delete("queue_record_id");
    } else {
      p.delete("load_id");
      p.delete("queue_record_id");
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    customerId: customerIdFromUrl,
    loadId: loadIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      customerId: customerIdFromUrl,
      loadId: loadIdFromUrl,
    }));
  }, [customerIdFromUrl, loadIdFromUrl]);

  function setCustomerFilter(next: string) {
    staged.setDraft((d) => ({ ...d, customerId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }

  const effectiveCustomerId = applied.customerId.trim() || undefined;
  const effectiveLoadId = applied.loadId.trim() || undefined;

  // queue data — server-side scoping (factoring-queue.routes.ts); queue capped at limit=200.
  const queueQ = useQuery({
    queryKey: ["dispatch", "factoring-queue", companyId, effectiveCustomerId, effectiveLoadId],
    queryFn: () => {
      const params = new URLSearchParams({ operating_company_id: companyId });
      if (effectiveCustomerId) params.set("customer_id", effectiveCustomerId);
      if (effectiveLoadId) params.set("load_id", effectiveLoadId);
      return apiRequest<QueueResponse>(`/api/v1/dispatch/factoring-queue?${params.toString()}`);
    },
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  // summary strip
  const summaryQ = useQuery({
    queryKey: ["factoring", "summary", companyId],
    queryFn: () => getFactoringSummary(companyId),
    enabled: Boolean(companyId),
  });

  const rows = queueQ.data?.rows ?? [];

  // Free-text search: ParityTable toolbar owns it (FAC-F3496) — stage filter stays page-local.
  const filtered = rows.filter((row) => {
    if (stageFilter !== "ALL" && row.packet_stage !== stageFilter) return false;
    return true;
  });

  // counts per stage for tab badges
  const countByStage = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.packet_stage] = (acc[r.packet_stage] ?? 0) + 1;
    return acc;
  }, {});

  const listState = useListState(queueQ, filtered.length === 0);
  const emptyText = listState.isEmpty
    ? stageFilter !== "ALL"
      ? "No loads match the current filter."
      : "No delivered loads in factoring queue."
    : undefined;

  const columns = useMemo<Array<ParityColumn<FactoringQueueRow>>>(
    () => [
      {
        key: "load_number",
        label: "Load #",
        sortable: true,
        className: "font-medium",
        render: (row) => <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />,
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="customer"
            id={row.customer_id}
            label={entityLabel(row.customer_name, row.customer_id, "Customer")}
          />
        ),
      },
      {
        key: "delivery_city",
        label: "Delivery",
        render: (row) => [row.delivery_city, row.delivery_state].filter(Boolean).join(", ") || "—",
      },
      {
        key: "delivered_at",
        label: "Delivered",
        sortable: true,
        render: (row) => fmtD(row.delivered_at),
      },
      {
        key: "rate_total_cents",
        label: "Rate",
        sortable: true,
        render: (row) => fmtM(row.rate_total_cents, row.currency_code),
      },
      {
        key: "packet_stage",
        label: "Status",
        sortable: true,
        render: (row) => (
          <>
            <span
              className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${
                STAGE_PILL[row.packet_stage]
              }`}
            >
              {STAGE_LABELS[row.packet_stage]}
            </span>
            {row.packet_approved_at && row.packet_stage === "PACKET_READY" ? (
              <div className="mt-0.5 text-xs text-slate-700">✓ Approved</div>
            ) : null}
          </>
        ),
      },
      {
        key: "missing_doc_types",
        label: "Missing Docs",
        render: (row) =>
          row.missing_doc_types.length === 0 ? (
            <span className="text-xs text-slate-700">✓ Complete</span>
          ) : (
            <span className="text-xs text-slate-700">
              Missing: {row.missing_doc_types.join(", ")}
            </span>
          ),
      },
      {
        key: "invoice_display_id",
        label: "Invoice",
        render: (row) =>
          row.invoice_id ? (
            <EntityLink
              kind="invoice"
              id={row.invoice_id}
              label={entityLabel(row.invoice_display_id, row.invoice_id, "Invoice")}
            />
          ) : (
            <span className="text-slate-700">No invoice</span>
          ),
      },
    ],
    [],
  );

  if (!companyId) {
    return (
      <div className="mx-auto max-w-6xl p-4 text-sm text-gray-500">
        Select an operating company to view the factoring queue.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-testid="factoring-queue-page">
      <PageHeader
        title="Factoring Queue"
        subtitle="Loads ready to submit to FARO — track packet status from delivery to advance"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void queryClient.invalidateQueries({ queryKey: ["dispatch", "factoring-queue", companyId] })}
            >
              Refresh
            </Button>
            <Link to="/accounting/factoring" className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              Accounting → Factoring
            </Link>
          </div>
        }
      />

      {/* Summary strip */}
      {summaryQ.data ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Active Factor</div>
            <div className="mt-1 font-semibold text-gray-900">
              {summaryQ.data.active_factor_name || "Not configured"}
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Reserve Balance</div>
            <div className="mt-1 font-semibold text-gray-900">
              {/* views.factoring_summary normalizes signed ledger cents to DOLLARS.
                  Format directly as dollars; do NOT divide by 100. Must match FactoringHome.tsx. */}
              {money.format(summaryQ.data.reserve_balance || 0)}
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">MTD Advances</div>
            <div className="mt-1 font-semibold text-gray-900">
              {/* mtd_advanced_total is also DOLLARS (0124 sums factoring_advances.advance_amount — no _cents). */}
              {money.format(summaryQ.data.mtd_advanced_total || 0)}{" "}
              <span className="text-xs text-gray-500">({summaryQ.data.mtd_advances_count} batch)</span>
            </div>
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Packet Queue</div>
            <div className="mt-1 font-semibold text-gray-900">
              {(countByStage["NOT_FACTORED"] ?? 0) + (countByStage["PACKET_READY"] ?? 0)} pending{" "}
              <span className="text-xs text-gray-500">
                ({countByStage["PACKET_READY"] ?? 0} ready to submit)
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative flex flex-wrap items-end gap-3" data-testid="factoring-dispatch-queue-filters">
        <label className="text-[11px] text-slate-600">
          Customer
          <EntityPicker
            kind="customer"
            operatingCompanyId={companyId}
            value={filterDraft.customerId || null}
            onChange={(next) => setCustomerFilter(next ?? "")}
            allowCreate={false}
            placeholder="All customers"
            className="mt-1"
            dataTestId="factoring-dispatch-filter-customer"
          />
        </label>
        <label className="text-[11px] text-slate-600">
          Load
          <EntityPicker
            kind="load"
            operatingCompanyId={companyId}
            value={filterDraft.loadId || null}
            onChange={(next) => setLoadFilter(next ?? "")}
            allowCreate={false}
            placeholder="All loads"
            className="mt-1"
            dataTestId="factoring-dispatch-filter-load"
          />
        </label>
        <Button type="button" size="sm" data-testid="factoring-dispatch-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="factoring-dispatch-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="factoring-dispatch-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {/* Stage filter tabs */}
      <div className="flex flex-wrap gap-1 rounded-sm border border-gray-200 bg-white p-2">
        {ALL_STAGES.map((stage) => {
          const count = stage === "ALL" ? rows.length : (countByStage[stage] ?? 0);
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStageFilter(stage)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                stageFilter === stage
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {stage === "ALL" ? "All" : STAGE_LABELS[stage as FactoringQueueRow["packet_stage"]]}
              {count > 0 ? (
                <span className="ml-1 rounded-full bg-white/20 px-1 text-xs">{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Queue table — shared ParityTable (GLOBAL-COLS-01 / ACCT-R-25 Phase A adoption) */}
      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage presenting as an empty factoring queue. */}
      {queueQ.isError ? (
        <ListErrorState
          title="Couldn't load the factoring queue"
          status={0}
          message={(queueQ.error as Error)?.message}
          onRetry={() => void queueQ.refetch()}
        />
      ) : (
      <ParityTable<FactoringQueueRow>
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.load_id}
        loading={queueQ.isLoading}
        emptyText={emptyText}
        storageKey="dispatch-factoring-queue"
        tableTestId="factoring-queue-table"
        exportFilename="factoring-queue"
      />
      )}

      {filtered.length > 0 ? (
        <p className="text-right text-xs text-gray-400">
          Showing {filtered.length} of {rows.length} loads
        </p>
      ) : null}
    </div>
  );
}
