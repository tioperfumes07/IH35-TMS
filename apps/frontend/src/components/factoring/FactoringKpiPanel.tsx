// ROUND 326.2 item 1 — Factoring KPI engine on screen. Every value comes from GET /api/v1/factoring/kpis (ledger +
// purchase document, server-side); every tile drills to the exact rows behind it (GET /kpis/:key/drill), each id an
// EntityLink back to its purchase / journal entry / bank deposit / invoice / load / customer. A KPI with no data says why.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFactoringKpiDrill, getFactoringKpis, type FactoringKpi, type FactoringKpiKey } from "../../api/factoring-kpis";
import { Modal } from "../Modal";
import { EntityLink, type EntityKind } from "../shared/EntityLink";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

const LINK_COLUMNS: Record<string, { kind: EntityKind; labelFrom?: string }> = {
  purchase_id: { kind: "factoring_purchase", labelFrom: "display_id" },
  journal_entry_id: { kind: "journal_entry" },
  bank_transaction_id: { kind: "bank_transaction" },
  invoice_id: { kind: "invoice", labelFrom: "invoice_display_id" },
  load_id: { kind: "load" },
  customer_id: { kind: "customer" },
  factoring_advance_id: { kind: "factoring_advance" },
};
const HIDDEN = new Set(["display_id", "invoice_display_id", "posting_id", "source_transaction_id"]);

function fmtValue(k: FactoringKpi) {
  if (k.value == null) return "—";
  if (k.unit === "cents") return formatUsdCents(k.value);
  if (k.unit === "percent") return `${k.value.toFixed(2)}%`;
  if (k.unit === "days") return `${k.value} d`;
  return String(k.value);
}

function cell(col: string, row: Record<string, unknown>) {
  const v = row[col];
  if (v == null || v === "") return "—";
  const link = LINK_COLUMNS[col];
  if (link) return <EntityLink kind={link.kind} id={String(v)} label={link.labelFrom && row[link.labelFrom] ? String(row[link.labelFrom]) : "open"} />;
  if (col.endsWith("_cents")) return <span className="tabular-nums">{formatUsdCents(Number(v))}</span>;
  if (/date$/.test(col)) return formatDateUS(String(v).slice(0, 10));
  return String(v);
}

export function FactoringKpiPanel({ companyId, from, to }: { companyId: string; from?: string; to?: string }) {
  const [drillKey, setDrillKey] = useState<FactoringKpiKey | null>(null);
  const kpis = useQuery({ queryKey: ["factoring", "kpis", companyId, from ?? null, to ?? null], queryFn: () => getFactoringKpis(companyId, from, to), enabled: Boolean(companyId) });
  const drill = useQuery({
    queryKey: ["factoring", "kpi-drill", companyId, drillKey, from ?? null, to ?? null],
    queryFn: () => getFactoringKpiDrill(companyId, drillKey as FactoringKpiKey, from, to),
    enabled: Boolean(companyId && drillKey),
  });
  const drillKpi = kpis.data?.kpis.find((k) => k.key === drillKey) ?? null;
  const cols = drill.data?.rows.length ? Object.keys(drill.data.rows[0]!).filter((c) => !HIDDEN.has(c)) : [];

  if (kpis.isError) {
    return (
      <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-700" data-testid="factoring-kpi-engine-error">
        Factoring KPIs could not load.{" "}
        <button type="button" className="underline" onClick={() => void kpis.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid="factoring-kpi-engine">
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-600">Factoring KPIs — from the ledger</span>
        {kpis.data ? <span className="text-slate-600">{formatDateUS(kpis.data.range.from)} – {formatDateUS(kpis.data.range.to)}</span> : null}
      </div>
      {kpis.isLoading ? <p className="text-xs text-slate-600">Loading…</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {(kpis.data?.kpis ?? []).map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setDrillKey(k.key)}
            className="rounded-sm border border-slate-200 bg-white p-2 text-left hover:border-slate-400"
            data-testid={`factoring-kpi-${k.key}`}
            title={`${k.source}${k.gl_account ? ` · GL ${k.gl_account}` : ""}`}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{k.label}</div>
            <div className="mt-1 text-xs font-semibold tabular-nums text-slate-900">{fmtValue(k)}</div>
            {k.compare_value != null ? (
              <div className="text-xs tabular-nums text-slate-600">{k.compare_label} {k.unit === "percent" ? `${k.compare_value.toFixed(2)}%` : k.compare_value}</div>
            ) : null}
            {k.buckets ? (
              <div className="text-xs tabular-nums text-slate-600">{k.buckets.map((b) => `${b.label}d: ${b.count}`).join(" · ")}</div>
            ) : null}
            <div className="mt-1 text-xs text-slate-600">{k.empty_reason ?? `${k.row_count} row(s) · drill`}</div>
          </button>
        ))}
      </div>
      {drillKey ? (
        <Modal open onClose={() => setDrillKey(null)} title={drillKpi ? `${drillKpi.label} — ${drillKpi.row_count} row(s)` : "KPI rows"}>
          <div className="text-xs" data-testid="factoring-kpi-drill">
            {drillKpi ? <p className="mb-2 text-slate-600">Source: {drillKpi.source}{drillKpi.gl_account ? ` · GL ${drillKpi.gl_account}` : ""}</p> : null}
            {drill.isLoading ? <p>Loading rows…</p> : null}
            {drill.data && !drill.data.rows.length ? <p className="text-slate-600">{drillKpi?.empty_reason ?? "No rows."}</p> : null}
            {cols.length ? (
              <table className="w-full">
                <thead>
                  <tr>{cols.map((c) => <th key={c} className="text-left font-semibold text-slate-600">{c.replace(/_cents$/, "").replaceAll("_", " ")}</th>)}</tr>
                </thead>
                <tbody>
                  {drill.data!.rows.map((r, i) => (
                    <tr key={i}>{cols.map((c) => <td key={c} className={c.endsWith("_cents") ? "text-right" : ""}>{cell(c, r)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
