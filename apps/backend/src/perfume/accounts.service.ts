/**
 * PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS (ScentsX). Owner 2026-11-26 20:21 CT ("different price levels credit limits approvals
 * new accounts new credit accounts"); 20:28 CT: levels Retail / Wholesale / Distributor / Export Mexico, each a markup on cost or
 * a fixed price per item; he approves every new credit account and any limit over $25,000.
 *
 * - A level's price for an item: its fixed price for the largest quantity break the line reaches; else its % on the item's cost
 *   (his moving-average cost across his sites, or the best supplier cost) — never a guessed number: no rule and no cost = type it.
 * - A customer account (one per Contacts company): cash / prepaid / credit / export, level, terms, limit, hold.
 * - Credit only through an approved credit application; a hold stops shipping (never quoting); every change is in the history.
 * Desk owner only (route layer); never posts to accounting.
 */
import type pg from "pg";
import { z } from "zod";
import { priceFromCost } from "./pricing.js";

export class AcctInvalid extends Error {}
export class AcctNotFound extends Error { constructor() { super("not_found"); } }
const OWNER_LIMIT_CENTS = 2_500_000; // $25,000 (owner 20:28 CT)

async function event(c: pg.PoolClient, companyId: string, uid: string | null, kind: string, detail: Record<string, unknown> = {}) {
  await c.query(`INSERT INTO perfume.customer_account_events (company_id, kind, detail, created_by) VALUES ($1,$2,$3::jsonb,$4)`, [companyId, kind, JSON.stringify(detail), uid]);
}

/* ------------------------------------------------------------------ price levels */

export async function listLevels(c: pg.PoolClient) {
  return (await c.query(
    `SELECT l.id, l.name, l.channel, l.method, l.pct::float8 AS pct, l.cost_basis, l.floor_pct::float8 AS floor_pct, l.tester_pct::float8 AS tester_pct, l.active, l.sort_order, l.updated_at,
            (SELECT count(*)::int FROM perfume.price_level_items i WHERE i.level_id = l.id AND i.archived_at IS NULL) AS fixed_prices,
            (SELECT count(*)::int FROM perfume.customer_accounts a WHERE a.price_level_id = l.id) AS customers
       FROM perfume.price_levels l ORDER BY l.sort_order, l.name`)).rows;
}
export const levelSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(), channel: z.enum(["retail", "wholesale", "distributor", "export"]).optional(),
  method: z.enum(["markup", "margin"]).optional(), pct: z.number().min(0).max(999).nullable().optional(), cost_basis: z.enum(["avg", "best_vendor"]).optional(),
  floor_pct: z.number().min(0).max(999).nullable().optional(), tester_pct: z.number().gt(0).max(100).optional(), active: z.boolean().optional(), sort_order: z.number().int().optional(),
});
export async function saveLevel(c: pg.PoolClient, uid: string, id: string | null, x: z.infer<typeof levelSchema>) {
  if ((x.method === "margin" || x.method === undefined) && x.pct != null && x.pct >= 100) {
    const m = id ? (await c.query<{ method: string }>(`SELECT method FROM perfume.price_levels WHERE id = $1`, [id])).rows[0]?.method : x.method;
    if ((x.method ?? m) === "margin") throw new AcctInvalid("A margin must be below 100%.");
  }
  if (!id) {
    if (!x.name || !x.channel) throw new AcctInvalid("A level needs a name and a channel.");
    return (await c.query<{ id: string }>(
      `INSERT INTO perfume.price_levels (name, channel, method, pct, cost_basis, floor_pct, sort_order, updated_by, tester_pct) VALUES ($1,$2,coalesce($3,'markup'),$4,coalesce($5,'avg'),$6,coalesce($7,100),$8,coalesce($9,70)) RETURNING id`,
      [x.name, x.channel, x.method ?? null, x.pct ?? null, x.cost_basis ?? null, x.floor_pct ?? null, x.sort_order ?? null, uid, x.tester_pct ?? null])).rows[0]!;
  }
  const b = (await c.query(`SELECT * FROM perfume.price_levels WHERE id = $1`, [id])).rows[0];
  if (!b) throw new AcctNotFound();
  const keep = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
  await c.query(
    `UPDATE perfume.price_levels SET name = $2, channel = $3, method = $4, pct = $5, cost_basis = $6, floor_pct = $7, active = $8, sort_order = $9, updated_by = $10, tester_pct = $11, updated_at = now() WHERE id = $1`,
    [id, x.name ?? b.name, x.channel ?? b.channel, x.method ?? b.method, keep(x.pct, b.pct), x.cost_basis ?? b.cost_basis, keep(x.floor_pct, b.floor_pct), keep(x.active, b.active), x.sort_order ?? b.sort_order, uid, x.tester_pct ?? b.tester_pct]);
  return { id };
}
export async function levelItems(c: pg.PoolClient, levelId: string) {
  return (await c.query(
    `SELECT p.id, p.item_id, i.display_name, p.min_qty, p.price_cents::bigint AS price_cents, p.updated_at
       FROM perfume.price_level_items p JOIN perfume.items i ON i.id = p.item_id WHERE p.level_id = $1 AND p.archived_at IS NULL ORDER BY i.display_name, p.min_qty`, [levelId])).rows
    .map((r) => ({ ...r, price_cents: Number(r.price_cents) }));
}
export async function setLevelItem(c: pg.PoolClient, uid: string, levelId: string, itemId: string, minQty: number, priceCents: number | null) {
  const cur = (await c.query<{ id: string }>(`SELECT id FROM perfume.price_level_items WHERE level_id = $1 AND item_id = $2 AND min_qty = $3 AND archived_at IS NULL`, [levelId, itemId, minQty])).rows[0];
  if (cur) await c.query(`UPDATE perfume.price_level_items SET archived_at = now(), updated_by = $2 WHERE id = $1`, [cur.id, uid]);
  if (priceCents != null) {
    await c.query(`INSERT INTO perfume.price_level_items (level_id, item_id, min_qty, price_cents, updated_by) VALUES ($1,$2,$3,$4,$5)`, [levelId, itemId, minQty, priceCents, uid]);
  }
}

/** The item's cost on the level's basis: moving average across my sites (weighted by what is on hand), else none. */
/** "My average cost" (owner 20:28 CT: "we use avg cost for lists"; 22:50 CT: "right now we are not worried about stock, we need to
 *  worry about having the costs"), in this order — the same costs the price desk shows:
 *   1. the stock ledger's moving average, where the item is in stock;
 *   2. my average cost (perfume.item_costs.avg_cost_cents — the desk's "My avg cost");
 *   3. my last cost on my current inventory file (the desk's "My last cost");
 *  null when none (the caller then uses the best supplier cost). A file cost under $1.00 is the file's placeholder (e.g. $0.01), not a cost. */
/**
 * A cost below $1.00 is a placeholder, not a cost (owner's file holds 321 items at 1–99¢ "avg cost"; a 100 ml perfume priced from 1¢
 * sold at 1¢ on 2026-11-27). Every pricer ignores it — the same floor the inventory-file fallback already used (price_cents >= 100).
 */
export const MIN_COST_CENTS = 100;

export async function avgCostOf(c: pg.PoolClient, itemId: string): Promise<{ cents: number; source: "stock" | "my_avg_cost" | "inventory_file" } | null> {
  const r = (await c.query<{ v: string | null }>(
    `SELECT (sum(qty * avg_cost_cents) / nullif(sum(qty), 0))::text AS v FROM perfume.item_stock WHERE item_id = $1 AND qty > 0`, [itemId])).rows[0];
  if (r?.v != null && Number(r.v) >= MIN_COST_CENTS) return { cents: Math.round(Number(r.v)), source: "stock" };
  const t = (await c.query<{ v: number | null }>(`SELECT avg_cost_cents AS v FROM perfume.item_costs WHERE item_id = $1 AND avg_cost_cents >= ${MIN_COST_CENTS}`, [itemId])).rows[0];
  if (t?.v != null) return { cents: Number(t.v), source: "my_avg_cost" };
  const f = (await c.query<{ v: string | null }>(
    `SELECT avg(r.price_cents)::text AS v FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id JOIN perfume.price_list_rows r ON r.list_id = l.id
      WHERE v.kind = 'inventory' AND l.is_current AND l.voided_at IS NULL AND r.item_id = $1 AND r.price_cents >= 100`, [itemId])).rows[0];
  return f?.v == null ? null : { cents: Math.round(Number(f.v)), source: "inventory_file" };
}

/** How many items have a cost each way — what the levels can price today. */
export async function costCoverage(c: pg.PoolClient) {
  return (await c.query<{ stock: number; my_avg_cost: number; inventory_file: number; vendor_lists: number; any_cost: number }>(
    `WITH s AS (SELECT DISTINCT item_id FROM perfume.item_stock WHERE qty > 0),
          t AS (SELECT item_id FROM perfume.item_costs WHERE avg_cost_cents >= ${MIN_COST_CENTS}),
          f AS (SELECT DISTINCT r.item_id FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id JOIN perfume.price_list_rows r ON r.list_id = l.id
                 WHERE v.kind = 'inventory' AND l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL AND r.price_cents >= 100),
          b AS (SELECT DISTINCT r.item_id FROM perfume.price_lists l JOIN perfume.vendors v ON v.id = l.vendor_id JOIN perfume.price_list_rows r ON r.list_id = l.id
                 WHERE v.kind <> 'inventory' AND l.is_current AND l.voided_at IS NULL AND r.item_id IS NOT NULL AND r.price_cents > 0)
     SELECT (SELECT count(*) FROM s)::int AS stock, (SELECT count(*) FROM t)::int AS my_avg_cost, (SELECT count(*) FROM f)::int AS inventory_file, (SELECT count(*) FROM b)::int AS vendor_lists,
            (SELECT count(*) FROM (SELECT item_id FROM s UNION SELECT item_id FROM t UNION SELECT item_id FROM f UNION SELECT item_id FROM b) u)::int AS any_cost`)).rows[0]!;
}

/** A customer's price for an item at a quantity, from their account's level. null = no level, or the level has no rule and no
 *  fixed price for it (the caller then falls back or asks for the price). */
type LevelRow = { id: string; name: string; method: "markup" | "margin"; pct: string | null; cost_basis: "avg" | "best_vendor"; floor_pct: string | null; tester_pct: string };

/** The cheapest current supplier price of an item (buy / both lists). */
export async function bestBuyCents(c: pg.PoolClient, itemId: string): Promise<number | null> {
  const r = await c.query<{ p: string | null }>(
    `SELECT min(r.price_cents)::text p FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id JOIN perfume.vendors v ON v.id = l.vendor_id
      WHERE r.item_id = $1 AND l.is_current AND l.voided_at IS NULL AND r.price_cents >= ${MIN_COST_CENTS} AND v.kind IN ('buy', 'both') AND v.archived_at IS NULL`, [itemId]);
  return r.rows[0]?.p == null ? null : Number(r.rows[0].p);
}

/** One item's price at one level: its fixed price break for the quantity, else the level's rule on its cost. */
async function ownLevelPrice(c: pg.PoolClient, l: LevelRow, itemId: string, qty: number, bestVendorCents: number | null) {
  const fixed = (await c.query<{ price_cents: string }>(
    `SELECT price_cents::text FROM perfume.price_level_items WHERE level_id = $1 AND item_id = $2 AND min_qty <= $3 AND archived_at IS NULL ORDER BY min_qty DESC LIMIT 1`,
    [l.id, itemId, Math.max(1, qty)])).rows[0];
  if (fixed) return { cents: Number(fixed.price_cents), level: l.name, how: "fixed" as const };
  if (l.pct == null) return null;
  const avg = l.cost_basis === "avg" ? await avgCostOf(c, itemId) : null;
  const cost = avg?.cents ?? (bestVendorCents != null && bestVendorCents >= MIN_COST_CENTS ? bestVendorCents : null);
  if (cost == null) return null;
  return { cents: priceFromCost(cost, Number(l.pct), l.method), level: l.name, how: avg ? ("avg" as const) : ("best_vendor" as const), cost_cents: cost,
    cost_source: avg?.source ?? ("best_vendor" as const) };
}

/**
 * The price an account's level gives an item. A TESTER (owner 2026-11-27 12:03 CT "sold at around 70 percent of the selling price of the
 * regular goods") with no fixed price of its own is priced at the level's tester_pct (default 70 %) of its regular item's price at the
 * same level (perfume.items.regular_item_id, migration 202617070100); with no regular linked or no regular price, the tester's own rule.
 */
export async function levelPriceFor(c: pg.PoolClient, companyId: string | null, itemId: string, qty: number, bestVendorCents: number | null) {
  if (!companyId) return null;
  const l = (await c.query<LevelRow>(
    `SELECT l.id, l.name, l.method, l.pct::text, l.cost_basis, l.floor_pct::text, l.tester_pct::text FROM perfume.customer_accounts a JOIN perfume.price_levels l ON l.id = a.price_level_id AND l.active
      WHERE a.company_id = $1`, [companyId])).rows[0];
  if (!l) return null;
  return priceAtLevel(c, l, itemId, qty, bestVendorCents);
}

export async function priceAtLevel(c: pg.PoolClient, l: LevelRow, itemId: string, qty: number, bestVendorCents: number | null) {
  const it = (await c.query<{ tester: boolean; regular_item_id: string | null }>(
    `SELECT 'TESTER' = ANY(coalesce(flags, '{}')) AS tester, regular_item_id FROM perfume.items WHERE id = $1`, [itemId])).rows[0];
  if (it?.tester && it.regular_item_id) {
    const ownFixed = (await c.query(`SELECT 1 FROM perfume.price_level_items WHERE level_id = $1 AND item_id = $2 AND min_qty <= $3 AND archived_at IS NULL LIMIT 1`,
      [l.id, itemId, Math.max(1, qty)])).rowCount;
    if (!ownFixed) {
      const reg = await ownLevelPrice(c, l, it.regular_item_id, qty, await bestBuyCents(c, it.regular_item_id));
      if (reg) {
        return { cents: Math.round((reg.cents * Number(l.tester_pct)) / 100), level: l.name, how: "tester_of_regular" as const,
          regular_item_id: it.regular_item_id, regular_cents: reg.cents, tester_pct: Number(l.tester_pct) };
      }
    }
  }
  return ownLevelPrice(c, l, itemId, qty, bestVendorCents);
}

/* ------------------------------------------------------------------ customer accounts */

const ACCT = `a.company_id, cc.name AS company_name, cc.city, cc.country, a.account_type, a.price_level_id, l.name AS price_level, a.terms_days, a.credit_limit_cents::float8 AS credit_limit_cents,
  a.on_hold, a.hold_reason, a.approved_at, ap.email AS approved_by_email, a.review_on::text, a.tax_number, a.resale_certificate, a.notes, a.updated_at,
  (SELECT count(*)::int FROM perfume.credit_applications x WHERE x.company_id = a.company_id AND x.status = 'submitted') AS open_applications,
  (SELECT coalesce(sum(sl.qty * sl.unit_price_cents), 0)::float8 FROM perfume.sales_orders o JOIN perfume.sales_order_lines sl ON sl.order_id = o.id AND sl.archived_at IS NULL
    WHERE o.company_id = a.company_id AND o.status = 'open' AND o.archived_at IS NULL) AS open_orders_cents`;
const ACCT_FROM = `perfume.customer_accounts a JOIN perfume.contact_companies cc ON cc.id = a.company_id LEFT JOIN perfume.price_levels l ON l.id = a.price_level_id
  LEFT JOIN identity.users ap ON ap.id = a.approved_by`;

export async function listAccounts(c: pg.PoolClient) {
  return (await c.query(`SELECT ${ACCT} FROM ${ACCT_FROM} ORDER BY cc.name`)).rows;
}
export async function getAccount(c: pg.PoolClient, companyId: string) {
  const a = (await c.query(`SELECT ${ACCT} FROM ${ACCT_FROM} WHERE a.company_id = $1`, [companyId])).rows[0] ?? null;
  const applications = (await c.query(
    `SELECT x.*, x.requested_limit_cents::float8 AS requested_limit_cents, x.approved_limit_cents::float8 AS approved_limit_cents, d.email AS decided_by_email
       FROM perfume.credit_applications x LEFT JOIN identity.users d ON d.id = x.decided_by WHERE x.company_id = $1 ORDER BY x.created_at DESC`, [companyId])).rows;
  const events = (await c.query(
    `SELECT e.id, e.kind, e.detail, e.created_at, u.email AS by_email FROM perfume.customer_account_events e LEFT JOIN identity.users u ON u.id = e.created_by
      WHERE e.company_id = $1 OR e.company_id IN (SELECT m.id FROM perfume.contact_companies m WHERE m.merged_into_id = $1)
      ORDER BY e.created_at, e.id`, [companyId])).rows;
  return { account: a, applications, events };
}

export const accountSchema = z.object({
  account_type: z.enum(["cash", "prepaid", "export"]).optional(),
  price_level_id: z.string().uuid().nullable().optional(),
  terms_days: z.number().int().min(0).max(365).nullable().optional(),
  credit_limit_cents: z.number().int().min(0).max(100_000_000_00).nullable().optional(),
  review_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tax_number: z.string().trim().max(40).nullable().optional(),
  resale_certificate: z.boolean().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
/** Opens the account (cash by default) or changes it. "credit" is never set here — only by approving an application. */
export async function saveAccount(c: pg.PoolClient, uid: string, companyId: string, x: z.infer<typeof accountSchema>) {
  const co = (await c.query(`SELECT 1 FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL`, [companyId])).rowCount;
  if (!co) throw new AcctInvalid("That company is not in Contacts.");
  const b = (await c.query(`SELECT * FROM perfume.customer_accounts WHERE company_id = $1 FOR UPDATE`, [companyId])).rows[0];
  if (!b) {
    await c.query(
      `INSERT INTO perfume.customer_accounts (company_id, account_type, price_level_id, terms_days, review_on, tax_number, resale_certificate, notes, updated_by)
       VALUES ($1, coalesce($2,'cash'), $3, $4, $5, $6, coalesce($7,false), $8, $9)`,
      [companyId, x.account_type ?? null, x.price_level_id ?? null, x.terms_days ?? null, x.review_on ?? null, x.tax_number ?? null, x.resale_certificate ?? null, x.notes ?? null, uid]);
    await event(c, companyId, uid, "created", { ...x });
    return;
  }
  if (b.account_type === "credit") {
    // A credit account's limit and terms move only by the owner (he is the only desk user); a raise over $25,000 says so.
    if (x.credit_limit_cents === null || x.terms_days === null) throw new AcctInvalid("A credit account keeps a limit and terms — put it back on cash to remove them.");
  } else if (x.credit_limit_cents != null) {
    throw new AcctInvalid("A limit comes only with an approved credit application.");
  }
  const keep = <T>(v: T | undefined, old: T) => (v !== undefined ? v : old);
  const type = x.account_type ?? b.account_type;
  const goingOffCredit = b.account_type === "credit" && x.account_type !== undefined;
  await c.query(
    `UPDATE perfume.customer_accounts SET account_type = $2, price_level_id = $3, terms_days = $4, credit_limit_cents = $5, review_on = $6, tax_number = $7, resale_certificate = $8,
            notes = $9, updated_by = $10, updated_at = now() WHERE company_id = $1`,
    [companyId, type, keep(x.price_level_id, b.price_level_id), goingOffCredit ? null : keep(x.terms_days, b.terms_days),
     goingOffCredit ? null : keep(x.credit_limit_cents, b.credit_limit_cents), keep(x.review_on, b.review_on), keep(x.tax_number, b.tax_number),
     keep(x.resale_certificate, b.resale_certificate), keep(x.notes, b.notes), uid]);
  const changed = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
  await event(c, companyId, uid, "changed", { ...changed, ...(x.credit_limit_cents != null && x.credit_limit_cents > OWNER_LIMIT_CENTS ? { over_25000_approved_by_owner: true } : {}) });
}

export async function setHold(c: pg.PoolClient, uid: string, companyId: string, hold: boolean, reason: string) {
  if (!reason.trim()) throw new AcctInvalid("Say why.");
  const r = await c.query(`UPDATE perfume.customer_accounts SET on_hold = $2, hold_reason = $3, updated_by = $4, updated_at = now() WHERE company_id = $1`,
    [companyId, hold, hold ? reason.trim() : null, uid]);
  if (!r.rowCount) throw new AcctNotFound();
  await event(c, companyId, uid, hold ? "hold" : "release", { reason: reason.trim() });
}

/** Shipping is refused while the customer is on hold (quoting never is). */
export async function assertCanShip(c: pg.PoolClient, companyId: string | null) {
  if (!companyId) return;
  const a = (await c.query<{ on_hold: boolean; hold_reason: string | null }>(`SELECT on_hold, hold_reason FROM perfume.customer_accounts WHERE company_id = $1`, [companyId])).rows[0];
  if (a?.on_hold) throw new AcctInvalid(`This customer is on hold: ${a.hold_reason ?? "no reason given"}. Release the hold to ship.`);
}

/* ------------------------------------------------------------------ credit applications */

export const applicationSchema = z.object({
  legal_name: z.string().trim().min(1).max(300), tax_number: z.string().trim().max(40).nullable().optional(), address: z.string().trim().max(1000).nullable().optional(),
  owners: z.string().trim().max(1000).nullable().optional(), trade_references: z.string().trim().max(4000).nullable().optional(),
  bank_reference: z.string().trim().max(1000).nullable().optional(), requested_limit_cents: z.number().int().min(1).max(100_000_000_00),
  requested_terms_days: z.number().int().min(0).max(365), resale_certificate: z.boolean().optional(), personal_guarantee: z.boolean().optional(),
});
export async function submitApplication(c: pg.PoolClient, uid: string, companyId: string, x: z.infer<typeof applicationSchema>) {
  const co = (await c.query(`SELECT 1 FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL`, [companyId])).rowCount;
  if (!co) throw new AcctInvalid("That company is not in Contacts.");
  const r = (await c.query<{ id: string }>(
    `INSERT INTO perfume.credit_applications (company_id, legal_name, tax_number, address, owners, trade_references, bank_reference, requested_limit_cents, requested_terms_days,
       resale_certificate, personal_guarantee, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10,false),coalesce($11,false),$12) RETURNING id`,
    [companyId, x.legal_name, x.tax_number ?? null, x.address ?? null, x.owners ?? null, x.trade_references ?? null, x.bank_reference ?? null, x.requested_limit_cents,
     x.requested_terms_days, x.resale_certificate ?? null, x.personal_guarantee ?? null, uid])).rows[0]!;
  await event(c, companyId, uid, "application", { application_id: r.id, requested_limit_cents: x.requested_limit_cents, requested_terms_days: x.requested_terms_days });
  return r;
}

/** The owner approves (his limit and terms, which may differ from the request) or rejects with a reason. Approval opens or
 *  turns the account to credit. */
export async function decideApplication(c: pg.PoolClient, uid: string, appId: string,
  x: { decision: "approved"; limit_cents: number; terms_days: number; note?: string | null } | { decision: "rejected"; note: string } | { decision: "withdrawn"; note?: string | null }) {
  const a = (await c.query<{ company_id: string; status: string; tax_number: string | null; resale_certificate: boolean }>(
    `SELECT company_id, status, tax_number, resale_certificate FROM perfume.credit_applications WHERE id = $1 FOR UPDATE`, [appId])).rows[0];
  if (!a) throw new AcctNotFound();
  if (a.status !== "submitted") throw new AcctInvalid("This application was already decided.");
  if (x.decision === "approved") {
    await c.query(`UPDATE perfume.credit_applications SET status = 'approved', approved_limit_cents = $2, approved_terms_days = $3, decision_note = $4, decided_by = $5, decided_at = now(),
      updated_at = now() WHERE id = $1`, [appId, x.limit_cents, x.terms_days, x.note ?? null, uid]);
    await c.query(
      `INSERT INTO perfume.customer_accounts (company_id, account_type, terms_days, credit_limit_cents, approved_by, approved_at, tax_number, resale_certificate, updated_by)
       VALUES ($1, 'credit', $2, $3, $4, now(), $5, $6, $4)
       ON CONFLICT (company_id) DO UPDATE SET account_type = 'credit', terms_days = EXCLUDED.terms_days, credit_limit_cents = EXCLUDED.credit_limit_cents,
         approved_by = EXCLUDED.approved_by, approved_at = now(), tax_number = coalesce(perfume.customer_accounts.tax_number, EXCLUDED.tax_number),
         resale_certificate = perfume.customer_accounts.resale_certificate OR EXCLUDED.resale_certificate, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [a.company_id, x.terms_days, x.limit_cents, uid, a.tax_number, a.resale_certificate]);
    await event(c, a.company_id, uid, "approved", { application_id: appId, limit_cents: x.limit_cents, terms_days: x.terms_days, over_25000: x.limit_cents > OWNER_LIMIT_CENTS });
  } else {
    if (x.decision === "rejected" && !x.note?.trim()) throw new AcctInvalid("Say why it is rejected.");
    await c.query(`UPDATE perfume.credit_applications SET status = $2, decision_note = $3, decided_by = $4, decided_at = now(), updated_at = now() WHERE id = $1`,
      [appId, x.decision, x.note ?? null, uid]);
    await event(c, a.company_id, uid, x.decision, { application_id: appId, note: x.note ?? null });
  }
}

export async function listApplications(c: pg.PoolClient, status?: string) {
  return (await c.query(
    `SELECT x.id, x.company_id, cc.name AS company_name, x.legal_name, x.requested_limit_cents::float8 AS requested_limit_cents, x.requested_terms_days, x.status,
            x.approved_limit_cents::float8 AS approved_limit_cents, x.approved_terms_days, x.created_at, x.decided_at, d.email AS decided_by_email
       FROM perfume.credit_applications x JOIN perfume.contact_companies cc ON cc.id = x.company_id LEFT JOIN identity.users d ON d.id = x.decided_by
      ${status ? "WHERE x.status = $1" : ""} ORDER BY x.created_at DESC LIMIT 1000`, status ? [status] : [])).rows;
}
