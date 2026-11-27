/**
 * TIO Perfumes · Customer ranking — ROUND P1.31 L1 (owner 2026-11-27 15:45 CT item 10: "categorize or rank on purchase capacity or
 * quantity"). A / B / C by purchases (Pareto: the customers making the first 80 % of purchases are A, the next 15 % B, the rest C),
 * per currency (USA store in USD, Mexico in MXN), from the old systems' purchase history plus ScentsX's own invoices. No balances.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { getPerfumeCustomerRanking, importPerfumePurchaseHistory, type PerfumeHistoryRow, type PerfumeRankRow } from "../../api/perfume";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { readSpreadsheet } from "./perfumeFileReaders";
import { tr } from "./perfumeI18n";
import { ctl, DASH, DocLink, usDate } from "./perfumeDocParts";

const fmt = (c: number, cur: string) => (c / 100).toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 });
const TIER_CLASS: Record<string, string> = { A: "bg-[#DCFCE7] text-[#166534]", B: "bg-[#FEF9C3] text-[#854D0E]", C: "bg-[#F1F5F9] text-[#475569]" };


/** Owner's workbook (TIO-Customers-Sales-USA-and-Mexico): "Detalle Mensual" (USA, one row per customer per month: no., name, month,
 *  invoices, sub-total, tax, total) and "Clientes México" (no., name, 2020 … 2025 in MXN). Purchases only — the Open Balance column is
 *  never read (owner 14:12 CT). A customer with no name in the store system keeps its number: "Customer #22522 (no name in store system)". */
export function historyRowsFromWorkbook(sheets: Array<{ name: string; cells: Array<Array<string | number | null>> }>): PerfumeHistoryRow[] {
  const out: PerfumeHistoryRow[] = [];
  const excelDate = (v: unknown): string | null => {
    if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`; }
    if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-01`;
    if (typeof v === "string" && /^\d{4}-\d{2}/.test(v)) return `${v.slice(0, 7)}-01`;
    return null;
  };
  const usa = sheets.find((s) => s.name.trim().toLowerCase() === "detalle mensual");
  for (const r of usa?.cells.slice(4) ?? []) {
    const [no, name, month, inv, , , total] = r;
    const period = excelDate(month);
    if (no == null || period == null || total == null || typeof total !== "number") continue;
    out.push({ source: "usa_store", customer_no: String(no), customer_name: name ? String(name).trim() : `Customer #${no} (no name in store system)`, period_kind: "month",
      period_start: period, invoices: typeof inv === "number" ? inv : 0, amount_cents: Math.round(total * 100), currency: "USD" });
  }
  const mx = sheets.find((s) => s.name.trim().toLowerCase() === "clientes méxico" || s.name.trim().toLowerCase() === "clientes mexico");
  for (const r of mx?.cells.slice(4) ?? []) {
    const [no, name] = r;
    if (typeof no !== "number" || !name) continue;
    for (let i = 0; i < 6; i += 1) {
      const v = r[2 + i];
      if (typeof v !== "number" || v === 0) continue;
      out.push({ source: "mexico_file", customer_no: String(no), customer_name: String(name).trim(), period_kind: "year", period_start: `${2020 + i}-01-01`, invoices: null,
        amount_cents: Math.round(v * 100), currency: "MXN" });
    }
  }
  return out;
}

function ImportHistory({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (f: File) => {
    setBusy(true);
    try {
      const rows = historyRowsFromWorkbook((await readSpreadsheet(f)).sheets);
      if (!rows.length) { pushToast("No 'Detalle Mensual' / 'Clientes México' rows in this file", "error"); return; }
      let n = 0;
      for (let i = 0; i < rows.length; i += 2000) n += (await importPerfumePurchaseHistory(rows.slice(i, i + 2000))).rows;
      const usd = rows.filter((x) => x.currency === "USD").reduce((s, x) => s + x.amount_cents, 0);
      pushToast(`${n.toLocaleString("en-US")} rows imported — USA $${(usd / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`, "success");
      onDone();
    } catch (e) { pushToast(userFacingApiError(e, "History not imported"), "error"); } finally { setBusy(false); }
  };
  return (
    <label className="text-xs" data-testid="perfume-rank-import">
      <span className="mr-2 text-[#64748B]">{tr("perfume.rank.import", "Import purchase history (customer sales workbook)")}</span>
      <input type="file" accept=".xlsx,.xls" aria-label={tr("perfume.rank.import", "Import purchase history")} disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ""; }} data-testid="perfume-rank-import-file" />
    </label>
  );
}

export function PerfumeRankingPanel() {
  const [cur, setCur] = useState<"USD" | "MXN">("USD");
  const [tier, setTier] = useState<"" | "A" | "B" | "C">("");
  const q = useQuery({ queryKey: ["perfume", "ranking", cur], queryFn: () => getPerfumeCustomerRanking(cur) });
  if (q.isError) return <ListErrorState title={tr("perfume.rank.error", "Couldn't load the ranking")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const rows = (d?.rows ?? []).filter((r) => !tier || r.tier === tier);
  return (
    <div className="space-y-3" data-testid="perfume-ranking-panel">
      <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3">
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="text-card-title">{tr("perfume.rank.title", "Customer ranking by purchases")}</div>
          <label>{tr("perfume.rank.currency", "Currency")}
            <select className={`${ctl} block`} aria-label={tr("perfume.rank.currency", "Currency")} value={cur} onChange={(e) => setCur(e.target.value as "USD" | "MXN")} data-testid="perfume-rank-currency">
              <option value="USD">{"USD — USA store + ScentsX"}</option><option value="MXN">{"MXN — Mexico"}</option>
            </select>
          </label>
          <ImportHistory onDone={() => void q.refetch()} />
          <span className="text-[#64748B]">{tr("perfume.rank.basis", "A = customers making the first 80% of purchases, B = the next 15%, C = the rest. Purchases only — no balances.")}</span>
        </div>
        {d ? (
          <div className="grid grid-cols-2 gap-[10px] md:grid-cols-5" data-testid="perfume-rank-kpis">
            <KpiCard label={tr("perfume.rank.total", "Purchases")} number={fmt(d.total_cents, cur)} onClick={() => setTier("")} />
            <KpiCard label={`A · ${tr("perfume.rank.customers", "customers")}`} number={d.tiers.A.toLocaleString("en-US")} onClick={() => setTier("A")} />
            <KpiCard label={`B · ${tr("perfume.rank.customers", "customers")}`} number={d.tiers.B.toLocaleString("en-US")} onClick={() => setTier("B")} />
            <KpiCard label={`C · ${tr("perfume.rank.customers", "customers")}`} number={d.tiers.C.toLocaleString("en-US")} onClick={() => setTier("C")} />
            <KpiCard label={tr("perfume.rank.linked", "Linked to a contact")} number={`${d.linked.toLocaleString("en-US")} / ${d.customers.toLocaleString("en-US")}`} disabled />
          </div>
        ) : null}
        <ParityTable<PerfumeRankRow>
          rows={rows} rowKey={(r) => r.key} loading={q.isLoading} storageKey="perfume-ranking-v1" exportFilename={`TIO customer ranking ${cur}`} exportExcel
          emptyText="No purchases imported yet in this currency."
          columns={[
            { key: "rank", label: "#", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => String(r.rank) },
            { key: "tier", label: "Tier", sortable: true, render: (r) => <span className={`rounded-sm px-2 py-[1px] text-xs font-semibold ${TIER_CLASS[r.tier]}`}>{r.tier}</span>, exportValue: (r) => r.tier },
            { className: "text-left", cellClass: "text-left", key: "customer", label: "Customer", sortable: true,
              render: (r) => (r.company_id ? <DocLink tab="customers" id={r.company_id}>{r.customer}</DocLink> : <span title="Not linked to a contact yet">{r.customer}</span>), exportValue: (r) => r.customer },
            { key: "lifetime_cents", label: "Purchases", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => fmt(r.lifetime_cents, cur), exportValue: (r) => r.lifetime_cents / 100 },
            { key: "share", label: "Share", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => `${(r.share * 100).toFixed(1)}%`, exportValue: (r) => r.share },
            { key: "last12_cents", label: "Last 12 months", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => fmt(r.last12_cents, cur), exportValue: (r) => r.last12_cents / 100 },
            { key: "invoices", label: "Invoices", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.invoices ? r.invoices.toLocaleString("en-US") : DASH) },
            { key: "months", label: cur === "MXN" ? "Years bought" : "Months bought", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.months.toLocaleString("en-US") },
            { key: "last_period_date", label: "Last purchase", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.last_period ? usDate(r.last_period) : DASH), exportValue: (r) => r.last_period ?? "" },
          ]}
        />
      </section>
    </div>
  );
}
