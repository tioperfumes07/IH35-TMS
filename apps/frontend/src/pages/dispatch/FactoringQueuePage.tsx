/**
 * FactoringQueuePage — Dispatch-side factoring packet queue.
 * Standalone page — Lane A wires route + sidebar entry (/dispatch/factoring-queue).
 *
 * Shows loads grouped by factoring lifecycle stage with action shortcuts.
 * Uses GET /api/v1/dispatch/factoring-queue (factoring-queue.routes.ts).
 * FARO Reserve summary strip reuses existing factoring summary API.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getFactoringSummary } from "../../api/factoring";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";

// ─── types ────────────────────────────────────────────────────────────────────

export type FactoringQueueRow = {
  load_id: string;
  load_number: string;
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
  PACKET_READY: "bg-blue-50 text-blue-700 border-blue-200",
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200",
  ADVANCE_RECEIVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESERVE_RELEASED: "bg-green-100 text-green-800 border-green-200",
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
  const [search, setSearch] = useState("");

  // queue data
  const queueQ = useQuery({
    queryKey: ["dispatch", "factoring-queue", companyId],
    queryFn: () =>
      apiRequest<QueueResponse>(
        `/api/v1/dispatch/factoring-queue?operating_company_id=${encodeURIComponent(companyId)}`,
      ),
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

  const filtered = rows.filter((row) => {
    if (stageFilter !== "ALL" && row.packet_stage !== stageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !row.load_number.toLowerCase().includes(q) &&
        !(row.customer_name ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // counts per stage for tab badges
  const countByStage = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.packet_stage] = (acc[r.packet_stage] ?? 0) + 1;
    return acc;
  }, {});

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
            <Link to="/accounting/factoring" className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
              Accounting → Factoring
            </Link>
          </div>
        }
      />

      {/* Summary strip */}
      {summaryQ.data ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Active Factor</div>
            <div className="mt-1 font-semibold text-gray-900">
              {summaryQ.data.active_factor_name || "Not configured"}
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Reserve Balance</div>
            <div className="mt-1 font-semibold text-gray-900">
              {money.format((summaryQ.data.reserve_balance || 0) / 100)}
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">MTD Advances</div>
            <div className="mt-1 font-semibold text-gray-900">
              {money.format((summaryQ.data.mtd_advanced_total || 0) / 100)}{" "}
              <span className="text-xs text-gray-500">({summaryQ.data.mtd_advances_count} batch)</span>
            </div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3 text-sm">
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

      {/* Stage filter tabs */}
      <div className="flex flex-wrap gap-1 rounded border border-gray-200 bg-white p-2">
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
                <span className="ml-1 rounded-full bg-white/20 px-1 text-[10px]">{count}</span>
              ) : null}
            </button>
          );
        })}
        <div className="ml-auto">
          <input
            type="text"
            placeholder="Search load # or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 placeholder-gray-400"
          />
        </div>
      </div>

      {/* Queue table */}
      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Load #</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Delivery</th>
              <th className="px-3 py-2">Delivered</th>
              <th className="px-3 py-2">Rate</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Missing Docs</th>
              <th className="px-3 py-2">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {queueQ.isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  Loading factoring queue…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  {rows.length === 0 ? "No delivered loads in factoring queue." : "No loads match the current filter."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.load_id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    <Link
                      to={`/dispatch?view=loads&load=${row.load_id}`}
                      className="text-sky-700 hover:underline"
                    >
                      {row.load_number}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{row.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {[row.delivery_city, row.delivery_state].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{fmtD(row.delivered_at)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {fmtM(row.rate_total_cents, row.currency_code)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        STAGE_PILL[row.packet_stage]
                      }`}
                    >
                      {STAGE_LABELS[row.packet_stage]}
                    </span>
                    {row.packet_approved_at && row.packet_stage === "PACKET_READY" ? (
                      <div className="mt-0.5 text-[10px] text-emerald-700">✓ Approved</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.missing_doc_types.length === 0 ? (
                      <span className="text-[10px] text-emerald-600">✓ Complete</span>
                    ) : (
                      <span className="text-[10px] text-amber-700">
                        Missing: {row.missing_doc_types.join(", ")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {row.invoice_id ? (
                      <Link
                        to={`/accounting/invoices/${row.invoice_id}`}
                        className="text-sky-700 hover:underline"
                      >
                        {row.invoice_display_id ?? "Invoice"}
                      </Link>
                    ) : (
                      <span className="text-amber-700">No invoice</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 ? (
        <p className="text-right text-xs text-gray-400">
          Showing {filtered.length} of {rows.length} loads
        </p>
      ) : null}
    </div>
  );
}
