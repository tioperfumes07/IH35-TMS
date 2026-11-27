/**
 * PERFUME-PROFILES (owner 2026-11-26 19:12 CT: "i need my complete customer and vendors profile etc as designed but better …
 * full and total complete linkage"). One read per profile, everything that points at it:
 *  - vendor: its company in Contacts, price lists, items it carries, lines waiting, codes and words remembered, POs, spend;
 *  - item: its barcodes, every vendor's own code / words / price for it, the words remembered, its quotes, orders and POs;
 *  - customer / company: its quotes, orders, the vendor it is (lists, POs) and the totals.
 * Read-only except linking a vendor to its company. Owner-only perfume schema.
 */
import type pg from "pg";
import { listQuotes } from "./quotes.service.js";
import { listOrders } from "./orders.service.js";
import { listPurchaseOrders } from "./purchases.service.js";

export class ProfileNotFound extends Error { constructor() { super("not_found"); } }
export class ProfileInvalid extends Error {}

const COMPANY = `cc.id, cc.name, cc.role, cc.vendor_type, cc.customer_type, cc.phone, cc.website, cc.address, cc.city, cc.state, cc.country, cc.status,
  (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = cc.id AND p.archived_at IS NULL) AS people,
  (SELECT p.email FROM perfume.contact_people p WHERE p.company_id = cc.id AND p.archived_at IS NULL AND p.email IS NOT NULL ORDER BY p.created_at LIMIT 1) AS email`;

export async function vendorProfile(c: pg.PoolClient, vendorId: string) {
  const v = (await c.query(
    `SELECT v.id, v.name, v.short_name, v.kind, v.roles, v.contact, v.company_id, v.created_at FROM perfume.vendors v WHERE v.id = $1 AND v.archived_at IS NULL`, [vendorId])).rows[0];
  if (!v) throw new ProfileNotFound();
  const company = v.company_id ? (await c.query(`SELECT ${COMPANY} FROM perfume.contact_companies cc WHERE cc.id = $1`, [v.company_id])).rows[0] ?? null : null;
  const lists = (await c.query(
    `SELECT l.id, l.list_date::text, l.label, l.file_name, l.source_kind, l.rows_saved, l.is_current, l.voided_at, l.imported_at,
            (SELECT count(*)::int FROM perfume.price_list_rows r WHERE r.list_id = l.id AND r.match_status = 'matched') AS matched,
            (SELECT count(*)::int FROM perfume.price_list_rows r WHERE r.list_id = l.id AND r.match_status <> 'matched') AS waiting
       FROM perfume.price_lists l WHERE l.vendor_id = $1 ORDER BY l.list_date DESC, l.imported_at DESC`, [vendorId])).rows;
  const counts = (await c.query<{ items: number; waiting: number; codes: number; words: number; confirmed: number }>(
    `SELECT (SELECT count(DISTINCT r.item_id)::int FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
              WHERE l.vendor_id = $1 AND l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL) AS items,
            (SELECT count(*)::int FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id
              WHERE l.vendor_id = $1 AND l.is_current AND l.voided_at IS NULL AND r.match_status <> 'matched') AS waiting,
            (SELECT count(*)::int FROM perfume.item_aliases a WHERE a.vendor_id = $1 AND a.sku IS NOT NULL) AS codes,
            (SELECT count(*)::int FROM perfume.item_aliases a WHERE a.vendor_id = $1 AND a.text_key IS NOT NULL) AS words,
            (SELECT count(*)::int FROM perfume.item_aliases a WHERE a.vendor_id = $1 AND a.method = 'confirmed') AS confirmed`, [vendorId])).rows[0]!;
  const purchase_orders = await listPurchaseOrders(c, { vendor_id: vendorId });
  const live = purchase_orders.filter((p) => p["status"] !== "cancelled");
  return {
    vendor: v, company, lists, ...counts, purchase_orders,
    po_total_cents: live.reduce((t, p) => t + Number(p["total_cents"]), 0),
    po_open: purchase_orders.filter((p) => p["status"] === "open").length,
  };
}

/** The vendor's company in Contacts (or none). */
export async function setVendorCompany(c: pg.PoolClient, vendorId: string, companyId: string | null) {
  if (companyId) {
    const ok = (await c.query(`SELECT 1 FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL`, [companyId])).rowCount;
    if (!ok) throw new ProfileInvalid("That company is not in Contacts.");
  }
  const r = await c.query(`UPDATE perfume.vendors SET company_id = $2, updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [vendorId, companyId]);
  if (!r.rowCount) throw new ProfileNotFound();
}

export async function itemProfile(c: pg.PoolClient, itemId: string) {
  const item = (await c.query(
    `SELECT i.id, i.internal_code, i.brand, i.name, i.size_ml::text, i.conc, i.gender, i.flags, i.model, i.product_type, i.category, i.description, i.family_id,
            (SELECT f.name FROM perfume.item_families f WHERE f.id = i.family_id) AS family, i.display_name, i.merged_into_id, i.created_at FROM perfume.items i WHERE i.id = $1`, [itemId])).rows[0];
  if (!item) throw new ProfileNotFound();
  if (item.merged_into_id) return { merged_into_id: item.merged_into_id as string };
  const upcs = (await c.query(`SELECT u.upc FROM perfume.item_upcs u WHERE u.item_id = $1 ORDER BY u.upc`, [itemId])).rows.map((r) => r.upc as string);
  // Every vendor's own line for this bottle on their current list: their code, their words, their price, how it linked.
  const vendor_lines = (await c.query(
    `SELECT r.id, v.id AS vendor_id, v.name AS vendor, v.kind, r.sku, r.upc, r.brand, r.description, r.size_text, r.price_cents::bigint AS price_cents,
            r.qty, r.match_method, l.list_date::text
       FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = $1 AND l.is_current AND l.voided_at IS NULL
      ORDER BY (v.kind = 'sell'), r.price_cents NULLS LAST, v.name`, [itemId])).rows.map((r) => ({ ...r, price_cents: r.price_cents == null ? null : Number(r.price_cents) }));
  const remembered = (await c.query(
    `SELECT a.id, v.name AS vendor, a.vendor_id, a.sku, a.text_key, a.method, a.confirmed_at FROM perfume.item_aliases a JOIN perfume.vendors v ON v.id = a.vendor_id
      WHERE a.item_id = $1 ORDER BY v.name, a.sku NULLS LAST, a.text_key`, [itemId])).rows;
  const [quotes, orders, purchase_orders] = await Promise.all([listQuotes(c, { item_id: itemId }), listOrders(c, { item_id: itemId }), listPurchaseOrders(c, { item_id: itemId })]);
  const buy = vendor_lines.filter((l) => l.kind !== "sell" && l.price_cents);
  return { item, upcs, vendor_lines, remembered, quotes, orders, purchase_orders, best_cost_cents: buy.length ? Math.min(...buy.map((l) => l.price_cents!)) : null };
}

export async function companyActivity(c: pg.PoolClient, companyId: string) {
  const company = (await c.query(`SELECT ${COMPANY} FROM perfume.contact_companies cc WHERE cc.id = $1`, [companyId])).rows[0];
  if (!company) throw new ProfileNotFound();
  const [quotes, orders] = await Promise.all([listQuotes(c, { company_id: companyId }), listOrders(c, { company_id: companyId })]);
  const vendors = (await c.query(`SELECT v.id, v.name, v.kind FROM perfume.vendors v WHERE v.company_id = $1 AND v.archived_at IS NULL ORDER BY v.name`, [companyId])).rows;
  const purchase_orders = (await Promise.all(vendors.map((v) => listPurchaseOrders(c, { vendor_id: v.id as string })))).flat();
  const live = (rows: Array<Record<string, unknown>>, bad: string) => rows.filter((r) => r["status"] !== bad).reduce((t, r) => t + Number(r["total_cents"]), 0);
  return {
    company, quotes, orders, vendors, purchase_orders,
    quoted_cents: live(quotes, "rejected"), ordered_cents: live(orders, "cancelled"), bought_cents: live(purchase_orders, "cancelled"),
  };
}
