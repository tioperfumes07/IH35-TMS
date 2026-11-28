/**
 * PERFUME M19 (LEAD ROUND L.32) — the customer center and the vendor center, QuickBooks style, on the ONE company record
 * (perfume.contact_companies, #29985): open balance (A/R and A/P, from the books' own aging math — customerAccount /
 * vendorAccount, never recomputed here), a Transactions list (quotes, sales orders, invoices, payments, credit memos,
 * purchase orders, bills, bill payments, vendor credits) where every row names the page that opens it, and the notes.
 * READ-ONLY: posts nothing, writes nothing.
 */
import type pg from "pg";
import { z } from "zod";
import { companyActivity } from "./profiles.service.js";
import { customerAccount, agingQuery } from "../scentsx/receivables.service.js";
import { vendorAccount, payablesQuery } from "../scentsx/payables.service.js";
import { scopeToScentsx } from "../scentsx/links.service.js";

export type CenterTxn = {
  key: string; type: "Quote" | "Sales order" | "Invoice" | "Payment" | "Credit memo" | "Purchase order" | "Bill" | "Bill payment" | "Vendor credit";
  side: "customer" | "vendor"; id: string; number: string | null; date: string | null; due_date: string | null; status: string | null;
  amount_cents: number; open_cents: number | null;
  /** Where the row opens: a perfume tab (`tab` + id → ?tab=…&open=…) or a books page path. */
  tab: string | null; path: string | null;
};

const n = (v: unknown) => (v == null ? 0 : Number(v));
const s = (v: unknown) => (v == null ? null : String(v));

export async function companyCenter(c: pg.PoolClient, companyId: string) {
  const act = await companyActivity(c, companyId);
  const notes = (await c.query<{ notes: string | null }>(`SELECT notes FROM perfume.contact_companies WHERE id = $1`, [companyId])).rows[0]?.notes ?? null;
  const txns: CenterTxn[] = [];
  for (const q of act.quotes as Array<Record<string, unknown>>) txns.push({ key: `q-${q.id}`, type: "Quote", side: "customer", id: String(q.id), number: s(q.number),
    date: s(q.quote_date), due_date: null, status: s(q.status), amount_cents: n(q.total_cents), open_cents: null, tab: "quotes", path: null });
  for (const o of act.orders as Array<Record<string, unknown>>) txns.push({ key: `o-${o.id}`, type: "Sales order", side: "customer", id: String(o.id), number: s(o.number),
    date: s(o.order_date), due_date: null, status: s(o.status), amount_cents: n(o.total_cents), open_cents: null, tab: "orders", path: null });
  for (const p of act.purchase_orders as Array<Record<string, unknown>>) txns.push({ key: `p-${p.id}`, type: "Purchase order", side: "vendor", id: String(p.id), number: s(p.number),
    date: s(p.order_date), due_date: null, status: s(p.status), amount_cents: n(p.total_cents), open_cents: null, tab: "purchases", path: null });

  await scopeToScentsx(c);
  const custIds = (await c.query<{ id: string }>(
    `SELECT customer_id::text AS id FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL`, [companyId])).rows.map((r) => r.id);
  const vendIds = (await c.query<{ id: string }>(
    `SELECT DISTINCT l.vendor_id::text AS id FROM scentsx.vendor_links l JOIN perfume.vendors v ON v.id = l.perfume_vendor_id
      WHERE v.company_id = $1::uuid AND l.voided_at IS NULL`, [companyId])).rows.map((r) => r.id);

  let arOpen = 0, apOpen = 0;
  const ar = { current: 0, b1: 0, b2: 0, b3: 0, total: 0 }, ap = { current: 0, b1: 0, b2: 0, b3: 0, total: 0 };
  for (const id of custIds) {
    const a = await customerAccount(c, id, agingQuery.parse({}));
    arOpen += a.buckets.total;
    for (const k of ["current", "b1", "b2", "b3", "total"] as const) ar[k] += a.buckets[k];
    // Every invoice of the customer (drafts too, as QuickBooks lists them); the open amount is the aging's for those on the books,
    // and none for a draft (not owed until it is finalized).
    const openOf = new Map(a.invoices.map((i) => [i.id, i.open_cents]));
    const all = (await c.query<{ id: string; number: string | null; issue_date: string; due_date: string | null; status: string; total_cents: string | null }>(
      `SELECT id::text, display_id AS number, issue_date::text, due_date::text, status, total_cents::text FROM accounting.invoices
        WHERE operating_company_id = scentsx.company_id() AND customer_id = $1::uuid AND is_sample_data = false ORDER BY issue_date DESC`, [id])).rows;
    for (const i of all) txns.push({ key: `i-${i.id}`, type: "Invoice", side: "customer", id: i.id, number: i.number, date: i.issue_date, due_date: i.due_date,
      status: i.status, amount_cents: n(i.total_cents), open_cents: openOf.get(i.id) ?? null, tab: null, path: `/accounting/invoices/${i.id}` });
    for (const p of a.payments) txns.push({ key: `pm-${p.id}`, type: "Payment", side: "customer", id: p.id, number: p.number, date: p.date, due_date: null,
      status: p.voided_at ? "voided" : p.unapplied_cents > 0 ? "unapplied" : "applied", amount_cents: p.amount_cents, open_cents: p.voided_at ? 0 : p.unapplied_cents,
      tab: null, path: `/accounting/payments/${p.id}` });
    const cms = (await c.query<{ id: string; display_id: string | null; issue_date: string; status: string; amount_cents: string; applied: string; voided: boolean }>(
      `SELECT id::text, display_id, issue_date::text, status, amount_cents::text, coalesce(amount_applied_cents, 0)::text AS applied, voided_at IS NOT NULL AS voided
         FROM accounting.credit_memos WHERE operating_company_id = scentsx.company_id() AND customer_id = $1::uuid ORDER BY issue_date DESC`, [id])).rows;
    for (const m of cms) txns.push({ key: `cm-${m.id}`, type: "Credit memo", side: "customer", id: m.id, number: m.display_id, date: m.issue_date, due_date: null,
      status: m.voided ? "voided" : m.status, amount_cents: n(m.amount_cents), open_cents: m.voided ? 0 : n(m.amount_cents) - n(m.applied), tab: null,
      path: `/accounting/credit-memos?id=${m.id}` });
  }
  for (const id of vendIds) {
    const v = await vendorAccount(c, id, payablesQuery.parse({}));
    apOpen += v.buckets.total;
    for (const k of ["current", "b1", "b2", "b3", "total"] as const) ap[k] += (v.buckets as Record<string, number>)[k] ?? 0;
    const openBy = new Map(v.open_bills.map((b) => [b.id, b.open_cents]));
    for (const b of v.bills as Array<Record<string, unknown>>) txns.push({ key: `b-${b.id}`, type: "Bill", side: "vendor", id: String(b.id), number: s(b.display_id ?? b.bill_number),
      date: s(b.bill_date), due_date: s(b.due_date), status: b.voided ? "voided" : s(b.status), amount_cents: n(b.amount_cents), open_cents: openBy.get(String(b.id)) ?? 0,
      tab: null, path: `/accounting/bills/${b.id}` });
    for (const p of v.payments as Array<Record<string, unknown>>) txns.push({ key: `bp-${p.id}`, type: "Bill payment", side: "vendor", id: String(p.id), number: s(p.check_number ?? p.reference_number),
      date: s(p.date), due_date: null, status: p.voided ? "voided" : "paid", amount_cents: n(p.amount_cents), open_cents: null, tab: null, path: `/accounting/bill-payments/${p.id}` });
    for (const vc of v.credits as Array<Record<string, unknown>>) txns.push({ key: `vc-${vc.id}`, type: "Vendor credit", side: "vendor", id: String(vc.id), number: s(vc.display_id),
      date: s(vc.issue_date), due_date: null, status: s(vc.status), amount_cents: n(vc.amount_cents), open_cents: n(vc.unapplied_cents), tab: null,
      path: `/accounting/vendor-credits?id=${vc.id}` });
  }
  txns.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.type.localeCompare(b.type));
  return {
    company: act.company, notes,
    customer_ids: custIds, vendor_ids: vendIds,
    open_ar_cents: arOpen, open_ap_cents: apOpen, ar_aging: ar, ap_aging: ap,
    quoted_cents: act.quoted_cents, ordered_cents: act.ordered_cents, bought_cents: act.bought_cents,
    transactions: txns,
    operating_company_id: await scopeToScentsx(c),
  };
}

export const companyNotesSchema = z.object({ notes: z.string().max(20000).nullable() });

/** The center's Notes box: one write, the old text kept in the company's history (perfume.lead_events). */
export async function saveCompanyNotes(c: pg.PoolClient, uid: string, companyId: string, notes: string | null) {
  const before = (await c.query<{ notes: string | null }>(`SELECT notes FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [companyId])).rows[0];
  if (!before) return { updated: 0 };
  const next = notes?.trim() ? notes : null;
  if ((before.notes ?? null) === next) return { updated: 0 };
  await c.query(`UPDATE perfume.contact_companies SET notes = $2, updated_at = now() WHERE id = $1`, [companyId, next]);
  await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'notes_edited', $2::jsonb, $3)`,
    [companyId, JSON.stringify({ from: before.notes, to: next }), uid]);
  return { updated: 1 };
}
