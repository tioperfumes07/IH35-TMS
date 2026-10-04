// ROUND 326.2 items 1-2 — one panel for every server-side KPI engine (factoring, banking). Every value comes from the
// engine's GET .../kpis (ledger / bank feed / document, computed on the server); every tile drills to the exact rows
// behind it (GET .../kpis/:key/drill), each id an EntityLink back to its record. A KPI with no data says why.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { EntityLink, type EntityKind } from "./EntityLink";
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
  bill_id: { kind: "bill" },
  settlement_id: { kind: "settlement" },
  bank_account_id: { kind: "bank_account", labelFrom: "bank_account" },
};
const HIDDEN = new Set(["display_id", "invoice_display_id", "posting_id", "source_transaction_id", "bank_account"]);

export type LedgerKpi = {
  key: string;
  label: string;
  unit: "cents" | "percent" | "days" | "count";
  value: number | null;
  compare_value?: number | null;
  compare_label?: string;
  source: string;
  gl_account: string | null;
  row_count: number;
  empty_reason: string | null;
  buckets?: Array<{ label: string; count: number; cents: number }>;
};
export type LedgerKpiResponse<K extends string> = { range: { from: string; to: string }; kpis: Array<LedgerKpi & { key: K }> };
export type LedgerKpiDrill = { rows: Array<Record<string, unknown>> };

function fmtValue(k: LedgerKpi) {
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

function fmtCompare(k: LedgerKpi) {
  const v = k.compare_value as number;
  if (k.unit === "percent" && k.compare_label === "Contracted") return `${v.toFixed(2)}%`;
  if (k.unit === "cents") return formatUsdCents(v);
  return String(v);
}

/** BANK-F2026100303 — fmtBucket is gone. It existed only to flatten every bucket into one inline
 *  string for the tile, which is the defect: Driver Escrow and Cash Position have the most buckets,
 *  so those tiles became unreadable. The tile now reports HOW MANY breakdowns there are and the
 *  drill renders them as a real table. */
function bucketCount(k: LedgerKpi) {
  return k.buckets?.length ?? 0;
}

type Props<K extends string> = {
  /** "factoring" | "banking" — query keys and test ids. */
  domain: string;
  title: string;
  companyId: string;
  from?: string;
  to?: string;
  fetchKpis: (companyId: string, from?: string, to?: string) => Promise<LedgerKpiResponse<K>>;
  fetchDrill: (companyId: string, key: K, from?: string, to?: string) => Promise<LedgerKpiDrill>;
};

export function LedgerKpiPanel<K extends string>({ domain, title, companyId, from, to, fetchKpis, fetchDrill }: Props<K>) {
  const [drillKey, setDrillKey] = useState<K | null>(null);
  const kpis = useQuery({ queryKey: [domain, "kpis", companyId, from ?? null, to ?? null], queryFn: () => fetchKpis(companyId, from, to), enabled: Boolean(companyId) });
  const drill = useQuery({
    queryKey: [domain, "kpi-drill", companyId, drillKey, from ?? null, to ?? null],
    queryFn: () => fetchDrill(companyId, drillKey as K, from, to),
    enabled: Boolean(companyId && drillKey),
  });
  const drillKpi = kpis.data?.kpis?.find((k) => k.key === drillKey) ?? null;
  const cols = drill.data?.rows?.length ? Object.keys(drill.data.rows[0]!).filter((c) => !HIDDEN.has(c)) : [];

  if (kpis.isError) {
    return (
      <div className="rounded-sm border border-slate-200 bg-white p-3 text-xs text-slate-700" data-testid={`${domain}-kpi-engine-error`}>
        {title} could not load.{" "}
        <button type="button" className="underline" onClick={() => void kpis.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <section className="rounded-sm border border-slate-200 bg-white p-3" data-testid={`${domain}-kpi-engine`}>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-slate-600">{title}</span>
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
            data-testid={`${domain}-kpi-${k.key}`}
            title={`${k.source}${k.gl_account ? ` · GL ${k.gl_account}` : ""}`}
          >
            {/* BANK-F2026100303 — A KPI TILE IS ONE NUMBER.
                What was here: label, value, compare, and EVERY bucket joined with " · ", all five
                lines at text-xs in the same slate-600 grey, inside a tile one fifth of the row wide.
                Driver Escrow and Cash Position carry the most buckets, so those two tiles rendered as
                a wall of text with no number you could find — the owner's exact complaint, and the
                reason a KPI stops being a KPI. The headline was `text-xs`, the SAME SIZE as its own
                label and footnotes, so nothing had hierarchy.
                Fixed the way QuickBooks and NetSuite do it: the number is the tile. One muted label
                above it, at most one comparison line under it, and the breakdown moved to the drill
                where it has the width to be a real table. Nothing is hidden — every bucket is still
                there, one click away, and now readable. */}
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
            <div className="mt-0.5 text-2xl font-semibold leading-tight tabular-nums text-slate-900">{fmtValue(k)}</div>
            {k.compare_value != null ? (
              <div className="mt-0.5 truncate text-[11px] tabular-nums text-slate-500">{k.compare_label} {fmtCompare(k)}</div>
            ) : null}
            <div className="mt-1 text-[11px] text-slate-400">
              {k.empty_reason ?? `${k.row_count} row${k.row_count === 1 ? "" : "s"}${bucketCount(k) ? ` · ${bucketCount(k)} breakdown${bucketCount(k) === 1 ? "" : "s"}` : ""}`}
            </div>
          </button>
        ))}
      </div>
      {drillKey ? (
        <Modal open onClose={() => setDrillKey(null)} title={drillKpi ? `${drillKpi.label} — ${drillKpi.row_count} row(s)` : "KPI rows"}>
          <div className="text-xs" data-testid={`${domain}-kpi-drill`}>
            {drillKpi ? <p className="mb-2 text-slate-600">Source: {drillKpi.source}{drillKpi.gl_account ? ` · GL ${drillKpi.gl_account}` : ""}</p> : null}
            {/* BANK-F2026100303 — the breakdown lives HERE, not crammed into the tile. Full width,
                every bucket, right-aligned tabular figures, and a total that ties so the owner can
                check the tile's headline against the sum of its parts without leaving the modal. */}
            {drillKpi?.buckets?.length ? (
              <div className="mb-3" data-testid={`${domain}-kpi-drill-breakdown`}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Breakdown</div>
                <table className="w-full tabular-nums">
                  <thead>
                    <tr>
                      <th className="text-left font-semibold text-slate-600">bucket</th>
                      <th className="text-right font-semibold text-slate-600">rows</th>
                      {drillKpi.unit === "cents" ? <th className="text-right font-semibold text-slate-600">amount</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {drillKpi.buckets.map((b) => (
                      <tr key={b.label}>
                        <td className="text-left">{b.label}</td>
                        <td className="text-right">{b.count}</td>
                        {drillKpi.unit === "cents" ? <td className="text-right">{formatUsdCents(b.cents)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 font-semibold">
                      <td className="text-left">Total</td>
                      <td className="text-right">{drillKpi.buckets.reduce((s, b) => s + b.count, 0)}</td>
                      {drillKpi.unit === "cents" ? (
                        <td className="text-right">{formatUsdCents(drillKpi.buckets.reduce((s, b) => s + b.cents, 0))}</td>
                      ) : null}
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
            {drill.isLoading ? <p>Loading rows…</p> : null}
            {drill.data && !drill.data.rows.length ? <p className="text-slate-600">{drillKpi?.empty_reason ?? "No rows."}</p> : null}
            {cols.length ? (
              <table className="w-full tabular-nums">
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
