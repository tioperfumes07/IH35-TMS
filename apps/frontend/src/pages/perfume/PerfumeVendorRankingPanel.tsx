/**
 * TIO Perfumes · Vendor ranking — ROUND L.31 M27 (owner 2026-11-27 19:38 CT "VENDORS … ALL FULLY COMPLETELY DONE"). Every buying vendor
 * ranked by what ScentsX LLC actually bought from it — its bills on the books (drafts, voids and sample bills never count), then the
 * purchase orders placed and received, and how many rows its latest price list carries. A / B / C on billed (first 80 % of spend A,
 * next 15 % B, the rest C), the same rule as the customer ranking. Read only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorState } from "../../components/ListErrorState";
import { formatUsdCents } from "../../lib/money";
import { getPerfumeVendorRanking, type PerfumeVendorRankRow } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { DASH, DocLink, usDate } from "./perfumeDocParts";

const TIER_CLASS: Record<string, string> = { A: "bg-[#DCFCE7] text-[#166534]", B: "bg-[#FEF9C3] text-[#854D0E]", C: "bg-[#F1F5F9] text-[#475569]" };

export function PerfumeVendorRankingPanel() {
  const q = useQuery({ queryKey: ["perfume", "vendor-ranking"], queryFn: getPerfumeVendorRanking });
  const [tier, setTier] = useState<"" | "A" | "B" | "C" | "none">("");
  if (q.isError) return <ListErrorState title={tr("perfume.vrank.error", "Couldn't load the vendor ranking")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const rows = (d?.rows ?? []).filter((r) => !tier || (tier === "none" ? r.tier == null : r.tier === tier));
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-vendor-ranking-panel" aria-label={tr("perfume.vrank.title", "Vendor ranking by purchases")}>
      <div className="flex flex-wrap items-baseline gap-2 text-xs">
        <div className="text-card-title">{tr("perfume.vrank.title", "Vendor ranking by purchases")}</div>
        <span className="text-[#64748B]">{tr("perfume.vrank.basis", "Billed = ScentsX's bills from the vendor on the books. A = vendors making the first 80% of spend, B = the next 15%, C = the rest.")}</span>
      </div>
      {d ? (
        <div className="grid grid-cols-2 gap-[10px] md:grid-cols-6" data-testid="perfume-vrank-kpis">
          <KpiCard label={tr("perfume.vrank.total", "Billed")} number={formatUsdCents(d.total_billed_cents)} onClick={() => setTier("")} />
          <KpiCard label={tr("perfume.vrank.ordered", "On purchase orders")} number={formatUsdCents(d.ordered_cents)} disabled />
          <KpiCard label="A" number={d.tiers.A.toLocaleString("en-US")} onClick={() => setTier("A")} />
          <KpiCard label="B" number={d.tiers.B.toLocaleString("en-US")} onClick={() => setTier("B")} />
          <KpiCard label="C" number={d.tiers.C.toLocaleString("en-US")} onClick={() => setTier("C")} />
          <KpiCard label={tr("perfume.vrank.none", "Not bought from yet")} number={(d.vendors - d.bought_from).toLocaleString("en-US")} onClick={() => setTier("none")} />
        </div>
      ) : null}
      <ParityTable<PerfumeVendorRankRow> selectable
        rows={rows} rowKey={(r) => r.vendor_id} loading={q.isLoading} storageKey="perfume-vendor-ranking-v1" exportFilename="TIO vendor ranking" exportExcel
        emptyText="No buying vendors yet."
        columns={[
          { key: "rank", label: "#", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.rank ? String(r.rank) : DASH), exportValue: (r) => r.rank ?? "" },
          { key: "tier", label: "Tier", sortable: true, render: (r) => (r.tier ? <span className={`rounded-sm px-2 py-[1px] text-xs font-semibold ${TIER_CLASS[r.tier]}`}>{r.tier}</span> : DASH), exportValue: (r) => r.tier ?? "" },
          { className: "text-left", cellClass: "text-left", key: "vendor", label: "Vendor", sortable: true,
            render: (r) => (r.company_id ? <DocLink tab="vendors" id={r.company_id}>{r.vendor}</DocLink> : <span>{r.vendor}</span>), exportValue: (r) => r.vendor },
          { key: "billed_cents", label: "Billed", kind: "number", sortable: true, cellClass: "text-right tabular-nums font-semibold", render: (r) => formatUsdCents(r.billed_cents), exportValue: (r) => r.billed_cents / 100 },
          { key: "share", label: "Share", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.tier ? `${(r.share * 100).toFixed(1)}%` : DASH), exportValue: (r) => r.share },
          { key: "billed12_cents", label: "Last 12 months", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => formatUsdCents(r.billed12_cents), exportValue: (r) => r.billed12_cents / 100 },
          { key: "bills", label: "Bills", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => String(r.bills) },
          { key: "ordered_cents", label: "Ordered (POs)", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => formatUsdCents(r.ordered_cents), exportValue: (r) => r.ordered_cents / 100 },
          { key: "received_cents", label: "Received", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => formatUsdCents(r.received_cents), exportValue: (r) => r.received_cents / 100 },
          { key: "pos", label: "POs", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => String(r.pos) },
          { key: "price_rows", label: "Price-list items", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.price_rows.toLocaleString("en-US") },
          { key: "last_bill_date", label: "Last bill", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.last_bill_date ? usDate(r.last_bill_date) : DASH), exportValue: (r) => r.last_bill_date ?? "" },
          { key: "last_po_date", label: "Last PO", sortable: true, cellClass: "text-right tabular-nums", render: (r) => (r.last_po_date ? usDate(r.last_po_date) : DASH), exportValue: (r) => r.last_po_date ?? "" },
        ]}
      />
    </section>
  );
}
