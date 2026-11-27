/**
 * SCENTSX sales returns (migration 202617080100) — owner 2026-11-27 13:50 CT, CONTROL's Returns (ticket → item → qty returned →
 * "Reposition" back to stock) done the QuickBooks way, against an issued ScentsX invoice, in ONE transaction:
 *   1. credit memo(s) through the one credit-memo writer (accounting/credit-memo-create.service.ts — the same code the Credit memos
 *      page runs): merchandise to 4800 Sales Returns & Allowances; the invoice's sales tax on the returned part to the tax line's
 *      account. Dr 4800 / Dr 2100, Cr A/R. Applied to the invoice while its open balance covers it; otherwise left as the customer's
 *      credit (to apply to another invoice or refund).
 *   2. back to stock (when the owner says so): a 'return' stock move through the inventory engine at the average cost the units
 *      shipped at (the stock-move poster books Dr Inventory / Cr COGS). Not restocked (damaged, thrown away) = no stock move — the
 *      cost of what left stays in COGS.
 *   3. the record: scentsx.sales_returns + sales_return_lines.
 * Never returns more than was billed on the invoice line minus what earlier returns took back. No GL math here.
 */
import type pg from "pg";
import { z } from "zod";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";
import { createCreditMemoInClientTx } from "../accounting/credit-memo-create.service.js";
import { stockIn, InvInvalid } from "../perfume/inventory.service.js";

export const RETURN_REASONS = ["damaged", "wrong_item", "not_ordered", "overshipped", "customer_changed_mind", "billing_error", "other"] as const;
export const returnSchema = z.object({
  invoice_id: z.string().uuid(),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.enum(RETURN_REASONS),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z.array(z.object({
    so_line_id: z.string().uuid(),
    qty: z.number().int().min(1).max(1_000_000),
    restock: z.boolean(),
    location_code: z.string().trim().min(1).max(40).nullable().optional(),
  })).min(1).max(500),
});

/** Credit memo reason per return reason (the credit-memo writer's own list). */
const MEMO_REASON: Record<(typeof RETURN_REASONS)[number], "damage" | "billing_error_ours" | "agreed_concession" | "other"> = {
  damaged: "damage", wrong_item: "billing_error_ours", not_ordered: "billing_error_ours", overshipped: "billing_error_ours",
  customer_changed_mind: "agreed_concession", billing_error: "billing_error_ours", other: "other",
};

type Billable = { so_line_id: string; line_no: number; item_id: string | null; description: string; unit_price_cents: number; billed: number; returned: number };

/** What on an invoice can still come back: each sales-order line billed on it, units billed, units already returned. */
export async function returnableLines(c: pg.PoolClient, invoiceId: string) {
  await scopeToScentsx(c);
  const inv = (await c.query<{ id: string; number: string | null; status: string; customer_id: string; customer: string | null; issue_date: string; total_cents: string }>(
    `SELECT i.id::text, i.display_id AS number, i.status, i.customer_id::text, cu.customer_name AS customer, i.issue_date::text, i.total_cents::text
       FROM accounting.invoices i LEFT JOIN mdata.customers cu ON cu.id = i.customer_id
      WHERE i.id = $1::uuid AND i.operating_company_id = scentsx.company_id()`, [invoiceId])).rows[0];
  if (!inv) throw new ScentsxLinkNotFound("That invoice is not on ScentsX's books.");
  const lines = (await c.query<Billable & { unit_price_cents: string }>(
    `SELECT l.id::text AS so_line_id, l.line_no, l.item_id::text, l.description, l.unit_price_cents::text,
            sum(x.qty)::int AS billed,
            coalesce((SELECT sum(rl.qty) FROM scentsx.sales_return_lines rl JOIN scentsx.sales_returns r ON r.id = rl.return_id
                       WHERE rl.so_line_id = l.id AND r.invoice_id = $1::uuid), 0)::int AS returned
       FROM scentsx.sales_order_invoice_lines x JOIN perfume.sales_order_lines l ON l.id = x.so_line_id
      WHERE x.invoice_id = $1::uuid
      GROUP BY l.id ORDER BY l.line_no`, [invoiceId])).rows.map((r) => ({ ...r, unit_price_cents: Number(r.unit_price_cents) }));
  const returns = (await c.query(
    `SELECT r.id::text, r.return_no, r.return_date::text, r.reason, r.merchandise_cents::bigint AS merchandise_cents, r.tax_cents::bigint AS tax_cents, r.credit_memo_ids::text[] AS credit_memo_ids
       FROM scentsx.sales_returns r WHERE r.invoice_id = $1::uuid ORDER BY r.created_at, r.return_no`, [invoiceId])).rows
    .map((r) => ({ ...r, merchandise_cents: Number(r.merchandise_cents), tax_cents: Number(r.tax_cents) }));
  return { invoice: { ...inv, total_cents: Number(inv.total_cents) }, lines: lines.map((l) => ({ ...l, can_return: l.billed - l.returned })), returns };
}

async function accountByNumber(c: pg.PoolClient, co: string, n: string) {
  const r = (await c.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL AND coalesce(is_postable, true) LIMIT 1`, [co, n])).rows[0];
  if (!r) throw new ScentsxLinkInvalid(`ScentsX account ${n} is missing or not postable — a return posts to it.`);
  return r.id;
}

export async function createReturn(c: pg.PoolClient, uid: string, x: z.infer<typeof returnSchema>) {
  const co = await scopeToScentsx(c);
  const { invoice, lines } = await returnableLines(c, x.invoice_id);
  if (!["sent", "partial", "paid"].includes(invoice.status)) {
    throw new ScentsxLinkInvalid(`Invoice ${invoice.number ?? ""} is ${invoice.status} — only an issued invoice takes a return (a draft is edited, a void has nothing to return).`);
  }
  // Lock the invoice so two returns cannot both take the last units back.
  await c.query(`SELECT 1 FROM accounting.invoices WHERE id = $1::uuid FOR UPDATE`, [x.invoice_id]);
  const seen = new Set<string>();
  let merch = 0;
  const picked = x.lines.map((w) => {
    if (seen.has(w.so_line_id)) throw new ScentsxLinkInvalid("The same invoice line is listed twice.");
    seen.add(w.so_line_id);
    const l = lines.find((r) => r.so_line_id === w.so_line_id);
    if (!l) throw new ScentsxLinkInvalid("That line is not on this invoice.");
    if (w.qty > l.can_return) throw new ScentsxLinkInvalid(`Line ${l.line_no} (${l.description}): ${l.billed} billed, ${l.returned} already returned — at most ${l.can_return} can come back.`);
    if (w.restock && !l.item_id) throw new ScentsxLinkInvalid(`Line ${l.line_no} is not an item — it cannot go back to stock.`);
    merch += w.qty * l.unit_price_cents;
    return { ...w, l };
  });
  // Sales tax on the returned part: the invoice's tax lines, in proportion to the merchandise returned over the merchandise billed.
  const t = (await c.query<{ tax: string; tax_account: string | null; merch_billed: string }>(
    `SELECT coalesce(sum(line_total_cents) FILTER (WHERE line_type = 'tax'), 0)::text AS tax,
            (array_agg(account_id::text) FILTER (WHERE line_type = 'tax'))[1] AS tax_account,
            coalesce(sum(line_total_cents) FILTER (WHERE line_type <> 'tax'
                     AND id IN (SELECT invoice_line_id FROM scentsx.sales_order_invoice_lines WHERE invoice_id = $1::uuid)), 0)::text AS merch_billed
       FROM accounting.invoice_lines WHERE invoice_id = $1::uuid AND soft_deleted_at IS NULL`, [x.invoice_id])).rows[0]!;
  const taxCents = Number(t.tax) > 0 && Number(t.merch_billed) > 0 ? Math.round((Number(t.tax) * merch) / Number(t.merch_billed)) : 0;
  const date = x.return_date ?? (await c.query<{ d: string }>(`SELECT (now() AT TIME ZONE 'America/Chicago')::date::text d`)).rows[0]!.d;
  // Numbers RET-YYYY-NNNNN, one at a time (an advisory lock, the same way the document-number generators serialize).
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('scentsx_sales_return_no'))`);
  const no = (await c.query<{ n: string }>(
    `SELECT 'RET-' || to_char($2::date, 'YYYY') || '-' || lpad((count(*) + 1)::text, 5, '0') AS n FROM scentsx.sales_returns WHERE operating_company_id = $1::uuid AND date_part('year', return_date) = date_part('year', $2::date)`,
    [co, date])).rows[0]!.n;

  // Credit memos — applied to the invoice while its open balance covers each one, else left as the customer's credit.
  const memoIds: string[] = [];
  const memo = async (amount: number, accountId: string, what: string) => {
    if (amount <= 0) return;
    const open = Number((await c.query<{ o: string }>(`SELECT (total_cents - accounting.invoice_applied_cents_as_of($1::uuid, 'infinity'::date)
         - coalesce((SELECT sum(applied_cents) FROM accounting.credit_memo_applications WHERE invoice_id = $1::uuid AND voided_at IS NULL), 0))::text o
       FROM accounting.invoices WHERE id = $1::uuid`, [x.invoice_id])).rows[0]!.o);
    const r = await createCreditMemoInClientTx(c as never, { operatingCompanyId: co, userId: uid, input: {
      customer_id: invoice.customer_id, issue_date: date, amount_cents: amount, reason: MEMO_REASON[x.reason], account_id: accountId,
      notes: `${no} · return on invoice ${invoice.number ?? ""} · ${what}${x.notes ? ` · ${x.notes}` : ""}`, related_invoice_id: x.invoice_id, apply_to_invoice: open >= amount } });
    if ("error" in r) throw new ScentsxLinkInvalid(`The credit memo was refused: ${String(r.error)}`);
    memoIds.push(String((r.data as { id: string }).id));
  };
  await memo(merch, await accountByNumber(c, co, "4800"), "merchandise");
  if (taxCents > 0) await memo(taxCents, t.tax_account ?? await accountByNumber(c, co, "2100"), "sales tax");

  const ret = (await c.query<{ id: string }>(
    `INSERT INTO scentsx.sales_returns (operating_company_id, return_no, invoice_id, customer_id, return_date, reason, merchandise_cents, tax_cents, credit_memo_ids, notes, created_by)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::date, $6, $7, $8, $9::uuid[], $10, $11::uuid) RETURNING id::text`,
    [co, no, x.invoice_id, invoice.customer_id, date, x.reason, merch, taxCents, memoIds, x.notes ?? null, uid])).rows[0]!;

  for (const p of picked) {
    let moveId: string | null = null, loc: string | null = null, unit: number | null = null;
    if (p.restock && p.l.item_id) {
      const out = (await c.query<{ loc: string | null; units: number; cost: string | null }>(
        `SELECT max(location_code) AS loc, coalesce(-sum(qty), 0)::int AS units, sum(-qty * unit_cost_cents)::text AS cost
           FROM perfume.stock_moves WHERE so_line_id = $1::uuid AND kind = 'shipment'`, [p.so_line_id])).rows[0]!;
      loc = p.location_code ?? out.loc;
      if (!loc) throw new ScentsxLinkInvalid(`Line ${p.l.line_no}: pick the site the units go back to.`);
      unit = out.units > 0 ? Math.round(Number(out.cost) / out.units) : 0;
      try {
        const so = (await c.query<{ order_id: string }>(`SELECT order_id::text FROM perfume.sales_order_lines WHERE id = $1::uuid`, [p.so_line_id])).rows[0]!;
        moveId = (await stockIn(c, uid, { kind: "return", item_id: p.l.item_id, location_code: loc, qty: p.qty, unit_cost_cents: unit, source: "return",
          sales_order_id: so.order_id, so_line_id: p.so_line_id, reason: `${no} · ${x.reason}` })).move_id;
      } catch (e) { if (e instanceof InvInvalid) throw new ScentsxLinkInvalid(e.message); throw e; }
    }
    await c.query(
      `INSERT INTO scentsx.sales_return_lines (operating_company_id, return_id, so_line_id, item_id, qty, unit_price_cents, restocked, location_code, unit_cost_cents, stock_move_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::uuid)`,
      [co, ret.id, p.so_line_id, p.l.item_id, p.qty, p.l.unit_price_cents, Boolean(moveId), loc, unit, moveId]);
  }
  return { id: ret.id, return_no: no, merchandise_cents: merch, tax_cents: taxCents, credit_memo_ids: memoIds };
}

/** Every return on ScentsX's books, newest first (the Returns list). */
export async function listReturns(c: pg.PoolClient) {
  await scopeToScentsx(c);
  return (await c.query(
    `SELECT r.id::text, r.return_no, r.return_date::text, r.reason, r.merchandise_cents::bigint AS merchandise_cents, r.tax_cents::bigint AS tax_cents,
            r.invoice_id::text, i.display_id AS invoice_no, r.customer_id::text, cu.customer_name AS customer,
            (SELECT coalesce(sum(qty), 0)::int FROM scentsx.sales_return_lines l WHERE l.return_id = r.id) AS units,
            (SELECT coalesce(sum(qty), 0)::int FROM scentsx.sales_return_lines l WHERE l.return_id = r.id AND l.restocked) AS restocked,
            r.credit_memo_ids::text[] AS credit_memo_ids, r.created_at
       FROM scentsx.sales_returns r JOIN accounting.invoices i ON i.id = r.invoice_id LEFT JOIN mdata.customers cu ON cu.id = r.customer_id
      ORDER BY r.created_at DESC, r.return_no DESC LIMIT 1000`)).rows.map((r) => ({ ...r, merchandise_cents: Number(r.merchandise_cents), tax_cents: Number(r.tax_cents) }));
}
