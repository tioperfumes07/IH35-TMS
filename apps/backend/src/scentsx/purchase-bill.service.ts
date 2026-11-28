/**
 * SCENTSX purchase bills (migration 202617120100) — owner 2026-11-27 15:05 CT "fully wire … ap, ar, customers, vendors".
 *
 * Receiving a TIO Perfumes PO posts Dr Inventory / Cr Goods Received Not Billed (stock-move poster). This bills the received
 * units: the vendor's invoice for them becomes a ScentsX A/P bill, and GRNI is cleared to exactly what the receipt put there.
 *
 * WRITES ZERO NEW GL MATH and no new bill writer:
 *   * the bill is created by createBillInClientTx (the one bill writer: duplicate-vendor-invoice control, number, audit) and posted
 *     by postBillDocumentInClientTx (the one bill poster: Dr each line's account / Cr A/P 2000). Each PO line is one bill line at
 *     the VENDOR's price to GRNI 2050; each other charge (freight, handling) is a line to the ScentsX account picked for it.
 *   * when the vendor's price differs from what the units were received at, the difference moves between GRNI and Cost of Goods
 *     Sold 5000 through createJournalEntryOnClient (balanced-or-refused, open period): received − billed > 0 → Dr GRNI / Cr COGS,
 *     < 0 → Dr COGS / Cr GRNI. So GRNI nets to zero for every unit billed, whatever the vendor charged.
 * One transaction: the bill, its posting, the variance entry and the billed-units rows commit together or not at all.
 * Received value per line = the value the receipt moves put into GRNI (receipts − vendor returns, qty × lot cost), so a later
 * edit of the PO cost cannot leave GRNI unbalanced. A unit is billed once: units on a live (not voided) bill are not billable.
 */
import { dueFromPickedTerms } from "../perfume/doc-catalogs.service.js";
import type pg from "pg";
import { z } from "zod";
import { createBillInClientTx, postBillDocumentInClientTx } from "../accounting/bills.service.js";
import { createVendorCreditInClientTx } from "../accounting/vendor-credits.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";
import { assertNotSanctionsBlocked } from "./sanctions.service.js";
import { itemPostingAccounts } from "./item-accounts.service.js";

type Q = pg.PoolClient;
const LIVE_BILL = `b.status NOT IN ('void', 'voided') AND b.revoked_at IS NULL`;
const LIVE_CREDIT = `vc.status <> 'voided' AND vc.voided_at IS NULL`;

export type BillablePoLine = {
  po_line_id: string; line_no: number; item_id: string | null; description: string; ordered: number; received: number;
  received_value_cents: number; billed: number; billed_received_value_cents: number; billed_value_cents: number;
  credited: number; credited_received_value_cents: number; credited_value_cents: number; to_bill: number; to_credit: number; unit_cost_cents: number;
};

/** Every line of the PO: units received (net of vendor returns) and their GRNI value, units already on a live bill, what is left. */
export async function billablePoLines(c: Q, poId: string): Promise<BillablePoLine[]> {
  await scopeToScentsx(c);
  if (!(await c.query(`SELECT 1 FROM perfume.purchase_orders WHERE id = $1::uuid AND archived_at IS NULL`, [poId])).rowCount) throw new ScentsxLinkNotFound();
  const r = await c.query<{ po_line_id: string; line_no: number; item_id: string | null; description: string; ordered: number; received: number;
    moved_qty: string | null; moved_value: string | null; billed: number; billed_value: string; billed_vendor_value: string;
    credited: number; credited_value: string; credited_vendor_value: string; unit_cost_cents: string }>(
    `SELECT l.id::text AS po_line_id, l.line_no, l.item_id::text,
            coalesce(nullif(l.description, ''), i.display_name, 'Line ' || l.line_no) AS description,
            l.qty AS ordered, l.qty_received AS received,
            (SELECT sum(m.qty) FROM perfume.stock_moves m WHERE m.po_line_id = l.id AND m.kind IN ('receipt', 'return'))::text AS moved_qty,
            (SELECT sum(m.qty * m.unit_cost_cents) FROM perfume.stock_moves m WHERE m.po_line_id = l.id AND m.kind IN ('receipt', 'return'))::text AS moved_value,
            coalesce((SELECT sum(x.qty) FROM scentsx.purchase_order_bill_lines x JOIN accounting.bills b ON b.id = x.bill_id
                       WHERE x.po_line_id = l.id AND ${LIVE_BILL}), 0)::int AS billed,
            coalesce((SELECT sum(x.received_value_cents) FROM scentsx.purchase_order_bill_lines x JOIN accounting.bills b ON b.id = x.bill_id
                       WHERE x.po_line_id = l.id AND ${LIVE_BILL}), 0)::text AS billed_value,
            coalesce((SELECT sum(x.billed_value_cents) FROM scentsx.purchase_order_bill_lines x JOIN accounting.bills b ON b.id = x.bill_id
                       WHERE x.po_line_id = l.id AND ${LIVE_BILL}), 0)::text AS billed_vendor_value,
            coalesce((SELECT sum(y.qty) FROM scentsx.purchase_order_vendor_credit_lines y JOIN accounting.vendor_credits vc ON vc.id = y.vendor_credit_id
                       WHERE y.po_line_id = l.id AND ${LIVE_CREDIT}), 0)::int AS credited,
            coalesce((SELECT sum(y.received_value_cents) FROM scentsx.purchase_order_vendor_credit_lines y JOIN accounting.vendor_credits vc ON vc.id = y.vendor_credit_id
                       WHERE y.po_line_id = l.id AND ${LIVE_CREDIT}), 0)::text AS credited_value,
            coalesce((SELECT sum(y.credited_value_cents) FROM scentsx.purchase_order_vendor_credit_lines y JOIN accounting.vendor_credits vc ON vc.id = y.vendor_credit_id
                       WHERE y.po_line_id = l.id AND ${LIVE_CREDIT}), 0)::text AS credited_vendor_value,
            l.unit_cost_cents::text
       FROM perfume.purchase_order_lines l LEFT JOIN perfume.items i ON i.id = l.item_id
      WHERE l.po_id = $1::uuid AND l.archived_at IS NULL
      ORDER BY l.line_no`,
    [poId]
  );
  return r.rows.map((x) => {
    // A stocked line's received value is what its receipt moves put into GRNI; a line with no item (a service, a fee) moved no
    // stock and booked nothing to GRNI — its received value is qty × the PO cost and it is billed to the account picked for it.
    const stocked = x.item_id != null;
    const received = stocked ? Number(x.moved_qty ?? 0) : x.received;
    const value = stocked ? Math.round(Number(x.moved_value ?? 0)) : received * Number(x.unit_cost_cents);
    // Units still owed to TIO by the vendor = billed units that came back and were not credited yet; units still to bill = received
    // units beyond what the vendor billed net of its credits.
    const netBilled = x.billed - x.credited;
    return {
      po_line_id: x.po_line_id, line_no: x.line_no, item_id: x.item_id, description: x.description, ordered: x.ordered, received,
      received_value_cents: value, billed: x.billed, billed_received_value_cents: Number(x.billed_value), billed_value_cents: Number(x.billed_vendor_value),
      credited: x.credited, credited_received_value_cents: Number(x.credited_value), credited_value_cents: Number(x.credited_vendor_value),
      to_bill: Math.max(0, received - netBilled), to_credit: Math.max(0, netBilled - received), unit_cost_cents: Number(x.unit_cost_cents),
    };
  });
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const purchaseBillSchema = z.object({
  vendor_invoice_number: z.string().trim().min(1).max(80),
  bill_date: dateStr,
  due_date: dateStr.nullable().optional(),
  memo: z.string().trim().max(500).nullable().optional(),
  lines: z.array(z.object({
    po_line_id: z.string().uuid(),
    qty: z.number().int().min(1).max(10_000_000),
    /** The vendor's price per unit on their invoice; absent = the price the units were received at. */
    unit_price_cents: z.number().int().min(0).max(100_000_000_00).optional(),
    /** Only for a line with no item (no GRNI was booked): the ScentsX account it is an expense / asset of. */
    account_id: z.string().uuid().optional(),
  })).min(1).max(2000),
  charges: z.array(z.object({
    /** Any other charge: the ScentsX account it is billed to. A landed cost names its kind instead (5100 / 5110 are used). */
    account_id: z.string().uuid().optional(),
    description: z.string().trim().min(1).max(200),
    amount_cents: z.number().int().min(1).max(100_000_000_00),
    /** M15: freight-in (5100) or customs / broker fees (5110) — spread over the bill's stocked lines into the on-hand units' cost. */
    landed: z.enum(["freight_in", "customs"]).optional(),
  }).refine((ch) => ch.landed || ch.account_id, { message: "pick the account for a charge that is not a landed cost" })).max(20).default([]),
});
export type PurchaseBillInput = z.infer<typeof purchaseBillSchema>;

function dueFromTerms(billDate: string, terms: string | null): string {
  const m = /net\s*(\d{1,3})/i.exec(terms ?? "");
  if (!m) return billDate; // no terms on the PO → due on receipt (QuickBooks' default)
  const d = new Date(`${billDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(m[1]));
  return d.toISOString().slice(0, 10);
}

async function scentsxAccount(c: Q, co: string, id: string): Promise<string> {
  const a = await c.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL AND is_postable`, [id, co]);
  if (!a.rows[0]) throw new ScentsxLinkInvalid("that account is not an active, postable ScentsX account");
  return a.rows[0].id;
}

export async function billPurchaseOrder(c: Q, uid: string, poId: string, x: PurchaseBillInput) {
  const co = await scopeToScentsx(c);
  const po = (await c.query<{ id: string; number: string; vendor_id: string; vendor_name: string; currency: string; terms: string | null; status: string;
    payment_terms_id: string | null }>(
    `SELECT p.id::text, p.number, p.vendor_id::text, v.name AS vendor_name, p.currency, p.terms, p.status, p.payment_terms_id::text
       FROM perfume.purchase_orders p JOIN perfume.vendors v ON v.id = p.vendor_id WHERE p.id = $1::uuid AND p.archived_at IS NULL FOR UPDATE OF p`, [poId])).rows[0];
  if (!po) throw new ScentsxLinkNotFound();
  if (po.currency !== "USD") throw new ScentsxLinkInvalid(`${po.number} is in ${po.currency}; ScentsX bills are in USD`);
  const link = await c.query<{ vendor_id: string }>(
    `SELECT vendor_id::text FROM scentsx.vendor_links WHERE perfume_vendor_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [po.vendor_id]);
  const vendorId = link.rows[0]?.vendor_id;
  if (!vendorId) throw new ScentsxLinkInvalid(`${po.vendor_name} is not a ScentsX vendor yet — use "Make ScentsX vendor" on its profile`);
  await assertNotSanctionsBlocked(c, { kind: "vendor", id: vendorId }, `${po.vendor_name} cannot be billed`);

  const lines = await billablePoLines(c, poId);
  const grni = await resolveRoleAccount(c as never, co, "goods_received_not_billed");
  const cogs = await resolveRoleAccount(c as never, co, "cogs_goods");
  const seen = new Set<string>();
  const billLines: { amountCents: number; description: string; accountId: string }[] = [];
  const rows: { line: BillablePoLine; qty: number; received: number; billed: number }[] = [];
  let variance = 0; // received value − billed value on stocked lines: > 0 → Dr GRNI / Cr COGS
  for (const w of x.lines) {
    if (seen.has(w.po_line_id)) throw new ScentsxLinkInvalid("a PO line is on this bill twice");
    seen.add(w.po_line_id);
    const l = lines.find((o) => o.po_line_id === w.po_line_id);
    if (!l) throw new ScentsxLinkInvalid(`that line is not on ${po.number}`);
    if (w.qty > l.to_bill) throw new ScentsxLinkInvalid(`${po.number} line ${l.line_no}: ${l.to_bill} received and not billed yet — ${w.qty} asked`);
    // GRNI held for these units: all that is left when the line is billed out, else the line's average received cost.
    const leftValue = l.received_value_cents - (l.billed_received_value_cents - l.credited_received_value_cents);
    const received = w.qty === l.to_bill ? leftValue : Math.round((w.qty * l.received_value_cents) / Math.max(1, l.received));
    const billed = w.unit_price_cents === undefined ? received : w.qty * w.unit_price_cents;
    if (billed <= 0) throw new ScentsxLinkInvalid(`${po.number} line ${l.line_no}: a bill line must be above $0`);
    const account = l.item_id ? grni : w.account_id ? await scentsxAccount(c, co, w.account_id) : null;
    if (!account) throw new ScentsxLinkInvalid(`${po.number} line ${l.line_no} has no item — pick the account it is billed to`);
    if (l.item_id) variance += received - billed;
    billLines.push({ amountCents: billed, accountId: account, description: `${po.number} L${l.line_no} · ${w.qty} × ${l.description}`.slice(0, 400) });
    rows.push({ line: l, qty: w.qty, received: l.item_id ? received : billed, billed });
  }
  const landedAcct: Record<"freight_in" | "customs", string | null> = { freight_in: null, customs: null };
  for (const ch of x.charges) {
    let acct: string;
    if (ch.landed) {
      acct = landedAcct[ch.landed] ?? (landedAcct[ch.landed] = await accountByNumber(c, co, LANDED_ACCOUNT[ch.landed]));
    } else acct = await scentsxAccount(c, co, ch.account_id!);
    billLines.push({ amountCents: ch.amount_cents, accountId: acct, description: `${po.number} · ${ch.landed ? `${LANDED_LABEL[ch.landed]}: ` : ""}${ch.description}`.slice(0, 400) });
  }
  if (x.charges.some((ch) => ch.landed) && !rows.some((r) => r.line.item_id)) {
    throw new ScentsxLinkInvalid("a landed cost needs at least one stocked (item) line on the bill to spread over");
  }
  const total = billLines.reduce((s, l) => s + l.amountCents, 0);
  const memo = (x.memo?.trim() || `TIO Perfumes ${po.number} · ${po.vendor_name} invoice ${x.vendor_invoice_number}`).slice(0, 500);

  const bill = await createBillInClientTx(c, {
    operatingCompanyId: co,
    source: "perfume_purchase",
    vendorId,
    billNumber: x.vendor_invoice_number,
    autoDisplayId: true,
    billDate: x.bill_date,
    // M20: the PO's picked terms (catalog days) first; else "Net N" in its text; else due on receipt.
    dueDate: x.due_date ?? (await dueFromPickedTerms(c, po.payment_terms_id, x.bill_date)) ?? dueFromTerms(x.bill_date, po.terms),
    amountCents: total,
    memo,
    lines: billLines,
  }, uid);
  const posting = await postBillDocumentInClientTx(c as never, { operating_company_id: co, bill_id: bill.id }, { userId: uid });
  let varianceJe: string | null = null;
  if (variance !== 0) {
    const amt = Math.abs(variance);
    const desc = `${po.number} purchase price variance · ${po.vendor_name} invoice ${x.vendor_invoice_number}`;
    const je = await createJournalEntryOnClient(c as never, {
      operating_company_id: co, entry_date: x.bill_date, memo: desc, source: "auto",
      source_transaction_type: "scentsx_purchase_price_variance", source_transaction_id: bill.id,
      postings: variance > 0
        ? [{ account_id: grni, debit_or_credit: "debit", amount_cents: amt, description: desc }, { account_id: cogs, debit_or_credit: "credit", amount_cents: amt, description: desc }]
        : [{ account_id: cogs, debit_or_credit: "debit", amount_cents: amt, description: desc }, { account_id: grni, debit_or_credit: "credit", amount_cents: amt, description: desc }],
    } as never, { userId: uid, role: "system" });
    varianceJe = String((je as { id: string }).id);
  }
  const landed = await capitalizeLandedCost(c, uid, co, { poId, poNumber: po.number, billId: bill.id, billDate: x.bill_date, vendor: po.vendor_name,
    invoice: x.vendor_invoice_number, charges: x.charges, accounts: landedAcct, rows });
  for (const r of rows) {
    await c.query(
      `INSERT INTO scentsx.purchase_order_bill_lines (operating_company_id, po_line_id, purchase_order_id, bill_id, qty, received_value_cents, billed_value_cents, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid)`,
      [co, r.line.po_line_id, poId, bill.id, r.qty, r.received, r.billed, uid]);
  }
  await c.query(
    `INSERT INTO scentsx.document_links (operating_company_id, purchase_order_id, bill_id, created_by) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid) ON CONFLICT DO NOTHING`,
    [co, poId, bill.id, uid]);
  return { bill_id: bill.id, display_id: (bill as { display_id?: string }).display_id ?? null, amount_cents: total, journal_entry_id: posting.journal_entry_id ?? null,
    variance_cents: variance, variance_journal_entry_id: varianceJe, units: rows.reduce((s, r) => s + r.qty, 0), landed };
}

const LANDED_ACCOUNT = { freight_in: "5100", customs: "5110" } as const;
const LANDED_LABEL = { freight_in: "Freight in", customs: "Customs / broker" } as const;

async function accountByNumber(c: Q, co: string, num: string): Promise<string> {
  const a = await c.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL AND is_postable LIMIT 1`, [co, num]);
  if (!a.rows[0]) throw new ScentsxLinkInvalid(`ScentsX account ${num} is missing`);
  return a.rows[0].id;
}

/** Split `total` cents by `weights` (largest remainder — the parts always sum to the total). */
export function splitCents(total: number, weights: number[]): number[] {
  const w = weights.reduce((s, x) => s + x, 0);
  if (w <= 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const raw = weights.map((x) => (total * x) / w);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, x) => s + x, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; out[i]! += 1; left--; }
  return out;
}

/**
 * M15 landed cost: each landed charge is spread over the bill's stocked lines by billed value; each line's share goes into the cost
 * of its units still on hand (the PO line's receipt lots and the lots transferred from them, oldest first, up to the units billed),
 * and the share of units already gone stays in 5100 / 5110. One balanced entry through the one journal-entry writer:
 * Dr each item's inventory account / Cr 5100 | 5110. Every slice is a scentsx.purchase_order_landed_costs row.
 */
async function capitalizeLandedCost(c: Q, uid: string, co: string, a: {
  poId: string; poNumber: string; billId: string; billDate: string; vendor: string; invoice: string;
  charges: PurchaseBillInput["charges"]; accounts: Record<"freight_in" | "customs", string | null>;
  rows: { line: BillablePoLine; qty: number; billed: number }[];
}) {
  const stocked = a.rows.filter((r) => r.line.item_id);
  const out = { allocated_cents: 0, capitalized_cents: 0, expensed_cents: 0, journal_entry_id: null as string | null };
  const pending: Array<{ kind: "freight_in" | "customs"; r: (typeof stocked)[number]; alloc: number; lots: Array<{ id: string; qty: number; cost: string; take: number; cap: number }> }> = [];
  const dr = new Map<string, number>(), cr = new Map<string, number>();
  for (const ch of a.charges) {
    if (!ch.landed) continue;
    const parts = splitCents(ch.amount_cents, stocked.map((r) => r.billed));
    for (let i = 0; i < stocked.length; i++) {
      const r = stocked[i]!, alloc = parts[i]!;
      if (alloc <= 0) continue;
      // The PO line's receipt lots and every lot transferred out of them, oldest first, that still hold units.
      const lots = (await c.query<{ id: string; qty_left: number; cost: string }>(
        `WITH RECURSIVE t AS (
           SELECT l.id, l.qty_left, l.unit_cost_cents, l.received_on, l.created_at FROM perfume.inventory_lots l WHERE l.po_line_id = $1::uuid
           UNION ALL
           SELECT k.id, k.qty_left, k.unit_cost_cents, k.received_on, k.created_at FROM perfume.inventory_lots k JOIN t ON k.parent_lot_id = t.id)
         SELECT id::text, qty_left, unit_cost_cents::text AS cost FROM t WHERE qty_left > 0 ORDER BY received_on, created_at, id`,
        [r.line.po_line_id])).rows;
      let want = r.qty;
      const picked: Array<{ id: string; qty: number; cost: string; take: number; cap: number }> = [];
      for (const l of lots) { if (want <= 0) break; const take = Math.min(want, l.qty_left); picked.push({ id: l.id, qty: l.qty_left, cost: l.cost, take, cap: 0 }); want -= take; }
      const onHand = picked.reduce((s, l) => s + l.take, 0);
      const cap = Math.round((alloc * onHand) / Math.max(1, r.qty));
      const caps = splitCents(cap, picked.map((l) => l.take));
      picked.forEach((l, k) => { l.cap = caps[k]!; });
      pending.push({ kind: ch.landed, r, alloc, lots: picked });
      out.allocated_cents += alloc; out.capitalized_cents += cap; out.expensed_cents += alloc - cap;
      if (cap > 0) {
        const inv = await inventoryAccountOf(c, co, r.line.item_id!);
        dr.set(inv, (dr.get(inv) ?? 0) + cap);
        const from = a.accounts[ch.landed]!;
        cr.set(from, (cr.get(from) ?? 0) + cap);
      }
    }
  }
  if (out.capitalized_cents > 0) {
    const desc = `${a.poNumber} landed cost into inventory · ${a.vendor} invoice ${a.invoice}`;
    const je = await createJournalEntryOnClient(c as never, {
      operating_company_id: co, entry_date: a.billDate, memo: desc, source: "auto",
      source_transaction_type: "scentsx_landed_cost", source_transaction_id: a.billId,
      postings: [
        ...[...dr].map(([account_id, amount_cents]) => ({ account_id, debit_or_credit: "debit", amount_cents, description: desc })),
        ...[...cr].map(([account_id, amount_cents]) => ({ account_id, debit_or_credit: "credit", amount_cents, description: desc })),
      ],
    } as never, { userId: uid, role: "system" });
    out.journal_entry_id = String((je as { id: string }).id);
  }
  for (const p of pending) {
    const lotsCap = p.lots.reduce((s, l) => s + l.cap, 0);
    if (!p.lots.length) {
      await c.query(
        `INSERT INTO scentsx.purchase_order_landed_costs (operating_company_id, bill_id, purchase_order_id, po_line_id, lot_id, kind, allocated_cents, capitalized_cents,
           expensed_cents, units_on_hand, journal_entry_id, created_by) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NULL, $5, $6, 0, $6, 0, NULL, $7::uuid)`,
        [co, a.billId, a.poId, p.r.line.po_line_id, p.kind, p.alloc, uid]);
      continue;
    }
    // The expensed part rides on the first lot's row, so the rows of one (charge, line) sum to its allocation.
    const parts = p.lots.map((l, k) => ({ l, alloc: l.cap + (k === 0 ? p.alloc - lotsCap : 0) }));
    for (const { l, alloc } of parts) {
      let after: string | null = l.cost;
      if (l.cap > 0) {
        const u = (await c.query<{ after: string; item_id: string; loc: string }>(
          `UPDATE perfume.inventory_lots SET unit_cost_cents = unit_cost_cents + ($2::numeric / qty_left) WHERE id = $1::uuid
           RETURNING unit_cost_cents::text AS after, item_id::text, location_code AS loc`, [l.id, l.cap])).rows[0]!;
        after = u.after;
        // The site's average cost follows: (qty × avg + capitalized) / qty.
        await c.query(`UPDATE perfume.item_stock SET avg_cost_cents = CASE WHEN qty > 0 THEN avg_cost_cents + ($3::numeric / qty) ELSE avg_cost_cents END, updated_at = now()
                        WHERE item_id = $1::uuid AND location_code = $2`, [u.item_id, u.loc, l.cap]);
      }
      await c.query(
        `INSERT INTO scentsx.purchase_order_landed_costs (operating_company_id, bill_id, purchase_order_id, po_line_id, lot_id, kind, allocated_cents, capitalized_cents,
           expensed_cents, units_on_hand, unit_cost_before, unit_cost_after, journal_entry_id, created_by)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10, $11, $12, $13, $14::uuid)`,
        [co, a.billId, a.poId, p.r.line.po_line_id, l.id, p.kind, alloc, l.cap, alloc - l.cap, l.take, l.cost, after, l.cap > 0 ? out.journal_entry_id : null, uid]);
    }
  }
  return out;
}

async function inventoryAccountOf(c: Q, co: string, itemId: string): Promise<string> {
  const m = await itemPostingAccounts(c, itemId);
  return m.inventory_account_id ?? (await resolveRoleAccount(c as never, co, "inventory_asset"));
}

/** The bills made from a PO (newest first), with their status and open balance. */
export async function purchaseOrderBills(c: Q, poId: string) {
  await scopeToScentsx(c);
  return (await c.query(
    `SELECT b.id::text, b.display_id, b.bill_number, b.bill_date::text, b.due_date::text, b.status, b.amount_cents::bigint::float8 AS amount_cents,
            (b.status IN ('void', 'voided') OR b.revoked_at IS NOT NULL) AS voided,
            (SELECT sum(x.qty) FROM scentsx.purchase_order_bill_lines x WHERE x.bill_id = b.id AND x.purchase_order_id = $1::uuid)::int AS units
       FROM accounting.bills b
      WHERE b.id IN (SELECT DISTINCT x.bill_id FROM scentsx.purchase_order_bill_lines x WHERE x.purchase_order_id = $1::uuid)
      ORDER BY b.created_at DESC, b.display_id DESC`, [poId])).rows;
}

export const vendorReturnCreditSchema = z.object({
  credit_date: dateStr,
  notes: z.string().trim().max(500).nullable().optional(),
  lines: z.array(z.object({ po_line_id: z.string().uuid(), qty: z.number().int().min(1).max(10_000_000) })).min(1).max(2000),
});

/**
 * Billed units sent back to the vendor → a ScentsX vendor credit through the ONE vendor-credit writer (Dr A/P / Cr GRNI) at the
 * vendor's billed price for those units; the difference against their received cost moves between GRNI and COGS through the shared
 * journal-entry writer, so GRNI nets to zero for the returned units. One transaction. Applied to an open bill by the existing route.
 */
export async function creditVendorReturn(c: Q, uid: string, poId: string, x: z.infer<typeof vendorReturnCreditSchema>) {
  const co = await scopeToScentsx(c);
  const po = (await c.query<{ number: string; vendor_id: string; vendor_name: string }>(
    `SELECT p.number, p.vendor_id::text, v.name AS vendor_name FROM perfume.purchase_orders p JOIN perfume.vendors v ON v.id = p.vendor_id
      WHERE p.id = $1::uuid AND p.archived_at IS NULL FOR UPDATE OF p`, [poId])).rows[0];
  if (!po) throw new ScentsxLinkNotFound();
  const vendorId = (await c.query<{ vendor_id: string }>(
    `SELECT vendor_id::text FROM scentsx.vendor_links WHERE perfume_vendor_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [po.vendor_id])).rows[0]?.vendor_id;
  if (!vendorId) throw new ScentsxLinkInvalid(`${po.vendor_name} is not a ScentsX vendor yet — use "Make ScentsX vendor" on its profile`);
  const lines = await billablePoLines(c, poId);
  const grni = await resolveRoleAccount(c as never, co, "goods_received_not_billed");
  const cogs = await resolveRoleAccount(c as never, co, "cogs_goods");
  const rows: { l: BillablePoLine; qty: number; received: number; credit: number }[] = [];
  for (const w of x.lines) {
    const l = lines.find((o) => o.po_line_id === w.po_line_id);
    if (!l) throw new ScentsxLinkInvalid(`that line is not on ${po.number}`);
    if (rows.some((r) => r.l.po_line_id === l.po_line_id)) throw new ScentsxLinkInvalid("a PO line is on this credit twice");
    if (w.qty > l.to_credit) throw new ScentsxLinkInvalid(`${po.number} line ${l.line_no}: ${l.to_credit} billed and returned and not credited yet — ${w.qty} asked`);
    const netUnits = Math.max(1, l.billed - l.credited);
    // The returned units left stock at their lot cost, which includes any landed cost capitalized into them (M15): that share is
    // part of what the return move put on GRNI, so it is part of `received` here — else it stays on GRNI after the credit.
    const landedPerUnit = Number((await c.query<{ v: string }>(
      `SELECT coalesce(sum(capitalized_cents::numeric / nullif(units_on_hand, 0)), 0)::text AS v FROM scentsx.purchase_order_landed_costs
        WHERE po_line_id = $1::uuid AND operating_company_id = $2::uuid`, [l.po_line_id, co])).rows[0]!.v);
    const received = Math.round((w.qty * (l.billed_received_value_cents - l.credited_received_value_cents)) / netUnits + w.qty * landedPerUnit);
    const credit = Math.round((w.qty * (l.billed_value_cents - l.credited_value_cents)) / netUnits);
    rows.push({ l, qty: w.qty, received, credit });
  }
  const total = rows.reduce((s, r) => s + r.credit, 0);
  if (total <= 0) throw new ScentsxLinkInvalid("nothing to credit");
  const vc = await createVendorCreditInClientTx(c, {
    operatingCompanyId: co, vendorId, issueDate: x.credit_date, amountCents: total, accountId: grni, userId: uid,
    notes: (x.notes?.trim() || `TIO Perfumes ${po.number} · goods returned to ${po.vendor_name}`).slice(0, 500),
  });
  // GRNI got the credit value; the returned units carried `received` there. received − credit > 0 → Dr COGS / Cr GRNI, < 0 → Dr GRNI / Cr COGS.
  const diff = rows.reduce((s, r) => s + r.received - r.credit, 0);
  let varianceJe: string | null = null;
  if (diff !== 0) {
    const amt = Math.abs(diff);
    const desc = `${po.number} returned-goods price difference · vendor credit ${vc.display_id}`;
    const je = await createJournalEntryOnClient(c as never, {
      operating_company_id: co, entry_date: x.credit_date, memo: desc, source: "auto",
      source_transaction_type: "scentsx_purchase_price_variance", source_transaction_id: vc.id,
      postings: diff > 0
        ? [{ account_id: cogs, debit_or_credit: "debit", amount_cents: amt, description: desc }, { account_id: grni, debit_or_credit: "credit", amount_cents: amt, description: desc }]
        : [{ account_id: grni, debit_or_credit: "debit", amount_cents: amt, description: desc }, { account_id: cogs, debit_or_credit: "credit", amount_cents: amt, description: desc }],
    } as never, { userId: uid, role: "system" });
    varianceJe = String((je as { id: string }).id);
  }
  for (const r of rows) {
    await c.query(
      `INSERT INTO scentsx.purchase_order_vendor_credit_lines (operating_company_id, po_line_id, purchase_order_id, vendor_credit_id, qty, received_value_cents, credited_value_cents, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::uuid)`, [co, r.l.po_line_id, poId, vc.id, r.qty, r.received, r.credit, uid]);
  }
  return { vendor_credit_id: vc.id, display_id: vc.display_id, amount_cents: total, journal_entry_id: vc.journal_entry_id, variance_cents: diff, variance_journal_entry_id: varianceJe,
    units: rows.reduce((s, r) => s + r.qty, 0) };
}
