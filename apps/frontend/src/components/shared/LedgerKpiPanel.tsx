// TABLE_DATE_OMIT: these tables have no fixed date column by design — the breakdown is one row per KPI BUCKET, and the drill-row columns come per KPI from the server (a dated KPI's rows carry their own *_date column, formatted by cell()).
// ROUND 326.2 items 1-2 — one panel for every server-side KPI engine (factoring, banking). Every value comes from the
// engine's GET .../kpis (ledger / bank feed / document, computed on the server); every tile drills to the exact rows
// behind it (GET .../kpis/:key/drill), each id an EntityLink back to its record. A KPI with no data says why.
import { MoneyCell } from "./MoneyCell";
import { useState } from "react";

// LEAD 443.173 (owner 2026-10-16: "by default it should not be so packed in any screen … not be packed always") — a KPI panel
// opens COLLAPSED to its title row; the viewer opens it with one click and that choice is remembered per panel (this browser).
const OPEN_KEY = (domain: string) => `ledger-kpi-open:${domain}`;
function readOpen(domain: string): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY(domain)) === "1";
  } catch {
    return false;
  }
}
function writeOpen(domain: string, open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY(domain), open ? "1" : "0");
  } catch {
    /* storage unavailable — the toggle still works for this view */
  }
}
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { ParityTable } from "../parity/ParityTable";
import { EntityLink, type EntityKind } from "./EntityLink";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents, QBO_MONEY_CELL_CLASS } from "../../lib/money";
import { colors, spacing } from "../../design/tokens";
import { kpiTileClasses } from "../layout/kpiTileClasses";

// KPI-TILE-COLOR LAW (owner ruling 2026-09-04, verbatim: "for all kpis i want different color not
// just white background a light color to distinguish and darker border").
// These tiles were `bg-white border-[#E5E7EB]` — a white tile on a white page, which is the owner's
// standing complaint and a violation of his own month-old ruling. design/tokens.ts has carried
// kpiTileBg / kpiTileBorder since that ruling and components/layout/DrillKpiCard.tsx already paints
// from them; this panel never did. Same pattern, same tokens, so Banking and Factoring KPIs finally
// match the rest of the system instead of disappearing into the page.
const KPI_TILE_STYLE = { backgroundColor: colors.kpiTileBg, borderColor: colors.kpiTileBorder, maxHeight: spacing.kpiTileMaxHeight };
// ROUND 435 — one tile size: the same shell / label / value as DrillKpiCard size="md", not a look-alike.
const TILE = kpiTileClasses("md");

/** Every drill id column is an EntityLink. 15 kinds, each verified against resolveEntityRoute. */
export const DRILL_ID_COLUMN_KIND: Record<string, EntityKind> = {
  purchase_id: "factoring_purchase",
  journal_entry_id: "journal_entry",
  bank_transaction_id: "bank_transaction",
  invoice_id: "invoice",
  load_id: "load",
  customer_id: "customer",
  factoring_advance_id: "factoring_advance",
  bill_id: "bill",
  settlement_id: "settlement",
  bank_account_id: "bank_account",
  fuel_transaction_id: "fuel_transaction",
  expense_id: "expense",
  vendor_id: "vendor",
  driver_id: "driver",
  account_id: "account",
};
const LABEL_FROM: Partial<Record<string, string>> = {
  purchase_id: "display_id",
  invoice_id: "invoice_display_id",
  bank_account_id: "bank_account",
};
const HIDDEN = new Set(["display_id", "invoice_display_id", "posting_id", "source_transaction_id", "bank_account"]);

export type LedgerKpi = {
  key: string;
  label: string;
  /** Tile headline. Drill rows use drill_label — do not reuse this name on LINE_COLS. */
  primary_label?: string;
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

function primaryId(row: Record<string, unknown>): { kind: EntityKind; id: string } | null {
  for (const [col, kind] of Object.entries(DRILL_ID_COLUMN_KIND)) {
    const id = row[col];
    if (id != null && id !== "") return { kind, id: String(id) };
  }
  return null;
}

function cell(col: string, row: Record<string, unknown>) {
  const v = row[col];
  if (v == null || v === "") return "—";
  if (col === "drill_label") {
    const target = primaryId(row);
    if (target) return <EntityLink kind={target.kind} id={target.id} label={String(v)} className="underline" />;
    return String(v);
  }
  const kind = DRILL_ID_COLUMN_KIND[col];
  if (kind) {
    const from = LABEL_FROM[col];
    const label = from && row[from] ? String(row[from]) : row.drill_label ? String(row.drill_label) : "open";
    return <EntityLink kind={kind} id={String(v)} label={label} className="underline" />;
  }
  if (col.endsWith("_cents")) {
    const formatted = formatUsdCents(Number(v));
    const target = primaryId(row);
    const cls = `${QBO_MONEY_CELL_CLASS} shrink-0 whitespace-nowrap`;
    if (target) return <EntityLink kind={target.kind} id={target.id} label={formatted} className={`${cls} underline`} />;
    return <span className={cls}>{formatted}</span>;
  }
  if (/date$/.test(col)) return formatDateUS(String(v).slice(0, 10));
  return String(v);
}

function fmtCompare(k: LedgerKpi) {
  const v = k.compare_value as number;
  if (k.unit === "percent" && k.compare_label === "Contracted") return `${v.toFixed(2)}%`;
  if (k.unit === "cents") return formatUsdCents(v);
  return String(v);
}

/** BANK-F2026100303 / r392 — fmtBucket is gone. It existed only to flatten every bucket into one
 *  inline string for the tile, which is the defect: Driver Escrow and Cash Position have the most
 *  buckets, so those tiles became unreadable. The tile now reports HOW MANY breakdowns there are
 *  and the drill renders them as a real table.
 *
 *  TILE_BUCKET_LIMIT = 0 means zero buckets may render on the tile face (QBO-style: one number).
 *  Slice buckets through this constant so a future raise is intentional and grep-visible. */
export const TILE_BUCKET_LIMIT = 0;

function bucketCount(k: LedgerKpi) {
  return k.buckets?.length ?? 0;
}

/** Buckets allowed on the tile face — always empty while TILE_BUCKET_LIMIT is 0. */
function bucketsOnTile(k: LedgerKpi) {
  return (k.buckets ?? []).slice(0, TILE_BUCKET_LIMIT);
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
  const [open, setOpenState] = useState<boolean>(() => readOpen(domain));
  const setOpen = (next: boolean) => {
    setOpenState(next);
    writeOpen(domain, next);
  };
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
      <div className="rounded-sm border border-[#E5E7EB] bg-white p-3 text-xs text-[#1F2A44]" data-testid={`${domain}-kpi-engine-error`}>
        {title} could not load.{" "}
        <button type="button" className="underline" onClick={() => void kpis.refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return (
    <section className={`rounded-sm border border-[#E5E7EB] bg-white ${open ? "p-3" : "px-3 py-2"}`} data-testid={`${domain}-kpi-engine`}>
      <div className={`${open ? "mb-2 " : ""}flex items-baseline justify-between text-xs`}>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-[#4B5563] hover:text-[#1F2A44]"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid={`${domain}-kpi-engine-toggle`}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
          {title}
        </button>
        {kpis.data ? <span className="text-[#4B5563]">{formatDateUS(kpis.data.range.from)} – {formatDateUS(kpis.data.range.to)}</span> : null}
      </div>
      {open && kpis.isLoading ? <p className="text-xs text-[#4B5563]">Loading…</p> : null}
      <div className={`${open ? "" : "hidden "}grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6`} data-testid={`${domain}-kpi-engine-tiles`}>
        {(kpis.data?.kpis ?? []).map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setDrillKey(k.key)}
            className={`${TILE.shell} transition hover:brightness-95`}
            style={KPI_TILE_STYLE}
            data-testid={`${domain}-kpi-${k.key}`}
            data-tile-bucket-limit={TILE_BUCKET_LIMIT}
            data-buckets-on-tile={bucketsOnTile(k).length}
            // ROUND 435 (owner): "the messages should not be there" — a tile is a NAME and a NUMBER. The source, the GL
            // account, the row count and any empty-state reason live in the hover title and in the drill modal, never as a
            // sentence inside the tile.
            title={`${k.source}${k.gl_account ? ` · GL ${k.gl_account}` : ""} · ${k.empty_reason ?? `${k.row_count} row${k.row_count === 1 ? "" : "s"}${bucketCount(k) ? ` · ${bucketCount(k)} breakdown${bucketCount(k) === 1 ? "" : "s"}` : ""}`}${k.compare_value != null ? ` · ${k.compare_label ?? "Compare"} ${fmtCompare(k)}` : ""}`}
          >
            {/* BANK-F2026100303 — A KPI TILE IS ONE NUMBER, except factoring wires vs expected
                which the owner wants as two quantities side by side, not a variance stacked on
                Expected. 12 banking tiles at lg:grid-cols-6 is two rows — three rows was "too many
                kpi boxes". */}
            <div className={TILE.label}>{k.primary_label ?? k.label}</div>
            {(k.key === "factoring_wires_vs_expected" || k.key === "cleared_vs_uncleared") && k.compare_value != null ? (
              <div className="flex items-baseline justify-center gap-3">
                <div className="min-w-0">
                  <div className={TILE.label}>{k.key === "cleared_vs_uncleared" ? "In" : "Wires"}</div>
                  <div className={`${TILE.value} tabular-nums`}>{fmtValue(k)}</div>
                </div>
                <div className="min-w-0">
                  <div className={TILE.label}>{k.compare_label ?? (k.key === "cleared_vs_uncleared" ? "Out" : "Expected")}</div>
                  <div className={`${TILE.value} tabular-nums`}>{fmtCompare(k)}</div>
                </div>
              </div>
            ) : (
              <div className={`${TILE.value} tabular-nums`}>{fmtValue(k)}</div>
            )}
          </button>
        ))}
      </div>
      {drillKey ? (
        <Modal open onClose={() => setDrillKey(null)} title={drillKpi ? `${drillKpi.label} — ${drillKpi.row_count} row(s)` : "KPI rows"}>
          <div className="text-xs" data-testid={`${domain}-kpi-drill`}>
            {drillKpi ? <p className="mb-2 text-[#4B5563]">Source: {drillKpi.source}{drillKpi.gl_account ? ` · GL ${drillKpi.gl_account}` : ""}</p> : null}
            {/* BANK-F2026100303 — the breakdown lives HERE, not crammed into the tile. Full width,
                every bucket, right-aligned tabular figures, and a total that ties so the owner can
                check the tile's headline against the sum of its parts without leaving the modal. */}
            {drillKpi?.buckets?.length ? (
              <div className="mb-3" data-testid={`${domain}-kpi-drill-breakdown`}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#6B7280]">Breakdown</div>
                <ParityTable<NonNullable<LedgerKpi["buckets"]>[number]>
                  storageKey={`${domain}-kpi-drill-buckets`}
                  tableTestId={`${domain}-kpi-drill-buckets`}
                  rows={drillKpi.buckets}
                  rowKey={(b) => b.label}
                  suppressToolbarSearch
                  suppressToolbarRange
                  hidePager
                  initialPageSize={300}
                  columns={[
                    { key: "label", label: "Bucket", sortable: true },
                    { key: "count", label: "Rows", sortable: true, kind: "number" },
                    ...(drillKpi.unit === "cents"
                      ? [{ key: "cents", label: "Amount", kind: "money" as const, render: (b: NonNullable<LedgerKpi["buckets"]>[number]) => <MoneyCell cents={b.cents} drill={{ none: "Breakdown bucket of this KPI — the rows listed below in this drill are its transactions" }} /> }]
                      : []),
                  ]}
                  footerCells={{
                    label: "Total",
                    count: drillKpi.buckets.reduce((s, b) => s + b.count, 0),
                    cents: drillKpi.unit === "cents" ? <MoneyCell cents={drillKpi.buckets.reduce((s, b) => s + b.cents, 0)} drill={{ none: "Total of the buckets above; it ties to the KPI tile and to the rows listed below" }} /> : null,
                  }}
                />
              </div>
            ) : null}
            {drill.isLoading ? <p>Loading rows…</p> : null}
            {drill.data && !drill.data.rows.length ? <p className="text-[#4B5563]">{drillKpi?.empty_reason ?? "No rows."}</p> : null}
            {cols.length ? (
              <ParityTable<Record<string, unknown> & { __row: string }>
                storageKey={`${domain}-kpi-drill-rows`}
                tableTestId={`${domain}-kpi-drill-rows`}
                rows={drill.data!.rows.map((r, i) => ({ ...r, __row: String(i) }))}
                rowKey={(r) => r.__row}
                suppressToolbarRange
                initialPageSize={100}
                pageSizeOptions={[100, 300]}
                allowAllPageSize
                columns={cols.map((c) => ({
                  key: c,
                  label: c.replace(/_cents$/, "").replaceAll("_", " "),
                  kind: c.endsWith("_cents") ? ("money" as const) : undefined,
                  sortValue: (r: Record<string, unknown>) => { const v = r[c]; return typeof v === "number" || typeof v === "string" ? v : v == null ? null : String(v); },
                  render: (r: Record<string, unknown>) => cell(c, r),
                }))}
              />
            ) : null}
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
