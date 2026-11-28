/**
 * SCENTSX vendor ranking (lives in scentsx/: it reads ScentsX's books — perfume/ reads perfume.* only, verify-perfume-desk-isolation) — ROUND L.31 M27 (owner 2026-11-27 19:38 CT "VENDORS … ALL FULLY COMPLETELY DONE"). The vendor side of the
 * customer ranking: every buying vendor (perfume.vendors kind 'buy') ranked by what TIO actually bought from it — ScentsX LLC's own
 * bills from the vendor (the books, through scentsx.vendor_links; same on-books rule as the A/P aging: drafts, voids, revoked and
 * sample bills excluded), then the purchase orders placed (non-cancelled lines, qty × unit cost) and received (qty received × cost).
 * ABC tier on billed (the customer ranking's abcTiers: A = first 80 % of spend, B = next 15 %, C = the rest). Also how wide the
 * vendor's latest price lists are. READ ONLY — no money is written here.
 */
import type pg from "pg";
import { abcTiers, type Tier } from "../perfume/customer-ranking.service.js";
import { ON_BOOKS, VENDOR_OF } from "./payables.service.js";
import { scopeToScentsx } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;

export type VendorRankRow = { vendor_id: string; vendor: string; company_id: string | null; billed_cents: number; billed12_cents: number; bills: number;
  ordered_cents: number; received_cents: number; pos: number; last_po_date: string | null; last_bill_date: string | null; price_rows: number;
  tier: Tier | null; rank: number | null; share: number };

export async function vendorRanking(c: Q) {
  // The bills are ScentsX's books: scope RLS to ScentsX for this transaction (the A/P aging does the same).
  const co = await scopeToScentsx(c);
  const today = (await c.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text AS d`)).rows[0]!.d;
  const rows = (await c.query<{ vendor_id: string; vendor: string; company_id: string | null; billed: string; billed12: string; bills: number;
    ordered: string; received: string; pos: number; last_po_date: string | null; last_bill_date: string | null; price_rows: number }>(
    `WITH bl AS (
       SELECT l.perfume_vendor_id, b.amount_cents, b.bill_date
         FROM accounting.bills b JOIN scentsx.vendor_links l ON l.vendor_id = ${VENDOR_OF("b")} AND l.voided_at IS NULL
        WHERE ${ON_BOOKS("b")}),
     po AS (
       SELECT p.vendor_id, count(DISTINCT p.id)::int AS pos, max(p.order_date) AS last_po_date,
              coalesce(sum(pl.qty::bigint * coalesce(pl.unit_cost_cents, 0)), 0) AS ordered,
              coalesce(sum(pl.qty_received::bigint * coalesce(pl.unit_cost_cents, 0)), 0) AS received
         FROM perfume.purchase_orders p LEFT JOIN perfume.purchase_order_lines pl ON pl.po_id = p.id AND pl.archived_at IS NULL
        WHERE p.archived_at IS NULL AND p.status <> 'cancelled' GROUP BY p.vendor_id),
     pr AS (
       SELECT DISTINCT ON (l.vendor_id) l.vendor_id, l.rows_saved FROM perfume.price_lists l WHERE l.voided_at IS NULL
        ORDER BY l.vendor_id, l.is_current DESC, l.list_date DESC NULLS LAST, l.imported_at DESC)
     SELECT v.id::text AS vendor_id, v.name AS vendor, v.company_id::text,
            coalesce((SELECT sum(amount_cents) FROM bl WHERE bl.perfume_vendor_id = v.id), 0)::text AS billed,
            coalesce((SELECT sum(amount_cents) FROM bl WHERE bl.perfume_vendor_id = v.id AND bl.bill_date > ($2::date - interval '12 months')::date), 0)::text AS billed12,
            (SELECT count(*)::int FROM bl WHERE bl.perfume_vendor_id = v.id) AS bills,
            (SELECT max(bill_date)::text FROM bl WHERE bl.perfume_vendor_id = v.id) AS last_bill_date,
            coalesce(po.ordered, 0)::text AS ordered, coalesce(po.received, 0)::text AS received, coalesce(po.pos, 0) AS pos, po.last_po_date::text,
            coalesce(pr.rows_saved, 0)::int AS price_rows
       FROM perfume.vendors v LEFT JOIN po ON po.vendor_id = v.id LEFT JOIN pr ON pr.vendor_id = v.id
      WHERE v.archived_at IS NULL AND v.kind = 'buy'`, [co, today])).rows;
  rows.sort((a, b) => Number(b.billed) - Number(a.billed) || Number(b.ordered) - Number(a.ordered) || b.price_rows - a.price_rows || a.vendor.localeCompare(b.vendor));
  const bought = rows.filter((r) => Number(r.billed) > 0);
  const tiers = abcTiers(bought.map((r) => Number(r.billed)));
  const total = bought.reduce((s, r) => s + Number(r.billed), 0);
  const out: VendorRankRow[] = rows.map((r) => {
    const i = bought.indexOf(r);
    return { vendor_id: r.vendor_id, vendor: r.vendor, company_id: r.company_id, billed_cents: Number(r.billed), billed12_cents: Number(r.billed12), bills: r.bills,
      ordered_cents: Number(r.ordered), received_cents: Number(r.received), pos: r.pos, last_po_date: r.last_po_date, last_bill_date: r.last_bill_date, price_rows: r.price_rows,
      tier: i >= 0 ? tiers[i]! : null, rank: i >= 0 ? i + 1 : null, share: i >= 0 && total > 0 ? Number(r.billed) / total : 0 };
  });
  const count = (t: Tier) => out.filter((r) => r.tier === t).length;
  return { total_billed_cents: total, vendors: out.length, bought_from: bought.length, tiers: { A: count("A"), B: count("B"), C: count("C") },
    ordered_cents: out.reduce((s, r) => s + r.ordered_cents, 0), rows: out };
}
