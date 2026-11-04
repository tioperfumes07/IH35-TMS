#!/usr/bin/env node
// ROUND 192 (Lead, 2026-09-25) — the fuel↔expense one-to-one guard.
// Row 127 / ENG-48 (11-03, ACCT-F11070) — re-grained to the PURCHASE and made reclassify-aware. Measured on prod
// (br-fancy-credit-akjnd07a, fork br-sparkling-shape-akac0up7) before this change: 704 failure lines on 333 rows, and every one
// of them except 13665-11 a measurement artifact of two wrong grains — not a books defect:
//   * (a)/(c) 105 + 366 lines — a Relay fill is ONE card charge. When it carries diesel + DEF (or reefer) the one Relay writer
//     (ensureRelayFillFuelRecords) records one fuel row PER PRODUCT, and the one document (adoptRelayFillExpenseDocument, Lead
//     443.41 A "one JE, the document adopts it") carries the whole charge, one line per product leg. 105 product rows on 102 fills
//     "had no expense" and 102 documents "≠ net+fee" — every one of the 102 documents equals its fill's rows to the cent. The old
//     rule demanded one document per ROW; the purchase is the FILL.
//   * (e) 233 lines — "13563-1 posts a 0¢ JE" (and the rest): the reclassify engine moves a posted line to another load by
//     stamping reversed_by_line_id on the original line and posting a reversing line + the replacement line, both carrying the
//     original line's (source_transaction_type, source_transaction_id). The old rule read the document's OWN entry minus the
//     reversed lines — so every reclassified document read 0¢. Read along the chain, all 749 posted fuel documents credit their
//     payment account, debit their expense accounts and land on their header load for exactly their total.
// Real defects this guard still names (and must keep naming): a purchase with no document or two documents, a document whose total
// is not its purchase's net+fee (13665-11 / fuel row ddc51b70: Relay printed a $2.00 sender fee the hand-entered row dropped — repair
// in the row-127 PR body), a live document on a dead fuel row, a live fuel row at $0, and a document whose chain does not land.
//
// RULES (USMCA, live rows = archived_at IS NULL AND voided_at IS NULL):
//   (a) every PURCHASE (a Relay fill = relay_fuel_transaction_id; otherwise the fuel row itself) with a live row carries EXACTLY ONE
//       live accounting.expenses document whose source_fuel_transaction_id is one of its rows.
//   (b) ZERO live expenses on a voided or archived fuel row.
//   (c) the document's total = Σ over the purchase's live rows of round(total_cost*100) + round(fee_amount*100). One-row purchase:
//       line 1 = net on the fuel item, line 2 (only when fee > 0) = the fee on "Fuel Card Fee". Multi-row Relay fill: every row's net
//       is one of the document's lines, the "Fuel Card Fee" lines sum to the fill's fees, and the lines sum to the total.
//   (d) zero live fuel rows with total_cost <= 0.
//   (e) a posted document, read along its posting chain: net CREDIT on payment_account_uuid = total; net DEBIT on every other
//       account = total; net DEBIT on the document's header load (load_id) on those accounts = total (the load one-to-one).
//
// Self-test: node scripts/verify-fuel-expense-one-to-one.mjs --selftest
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B)";

const LABEL = "verify-fuel-expense-one-to-one";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FEE_ITEM_NAME = "Fuel Card Fee";

const c100 = (v) => Math.round(Number(v ?? 0) * 100);

/** Pure — a live expense's total must equal round(total_cost*100) + round(fee_amount*100) to the cent (one row). */
export function expenseTotalMatchesNetPlusFee(totalAmountCents, totalCost, feeAmount) {
  return Number(totalAmountCents) === c100(totalCost) + c100(feeAmount);
}

/** Pure — the purchase key: a Relay fill groups its product rows; any other fuel row is its own purchase. */
export function purchaseKey(row) {
  return row.relay_fuel_transaction_id ? `relay:${row.relay_fuel_transaction_id}` : `row:${row.id}`;
}

/**
 * Pure — rules (a) and (c) for ONE purchase.
 * rows: [{ id, total_cost, fee_amount }] (live rows only) · docs: [{ id, expense_number, total_amount_cents, lines: [{ seq, cents, item_name }] }]
 */
export function checkPurchase(rows, docs) {
  const out = [];
  if (!rows.length) return out;
  if (docs.length !== 1) {
    out.push(`(a) purchase of ${rows.length} live fuel row(s) [${rows.map((r) => r.id).join(", ")}] has ${docs.length} live expense document(s), expected exactly 1`);
    return out;
  }
  const doc = docs[0];
  const label = doc.expense_number ?? doc.id;
  const net = rows.reduce((t, r) => t + c100(r.total_cost), 0);
  const fee = rows.reduce((t, r) => t + c100(r.fee_amount), 0);
  if (Number(doc.total_amount_cents) !== net + fee) out.push(`(c) expense ${label} total_amount_cents=${doc.total_amount_cents}, expected net ${net} + fee ${fee} = ${net + fee}`);
  const lines = [...(doc.lines ?? [])].sort((a, b) => a.seq - b.seq);
  if (rows.length === 1) {
    const l1 = lines.find((l) => l.seq === 1), l2 = lines.find((l) => l.seq === 2);
    if (Number(l1?.cents ?? -1) !== net) out.push(`(c) expense ${label} line 1 amount_cents=${l1?.cents ?? "MISSING"}, expected net ${net} (total_cost)`);
    if (fee > 0) {
      if (Number(l2?.cents ?? -1) !== fee) out.push(`(c) expense ${label} has fee ${fee} but line 2 amount_cents=${l2?.cents ?? "MISSING"}, expected ${fee}`);
      if (l2 && l2.item_name !== FEE_ITEM_NAME) out.push(`(c) expense ${label} line 2 item is "${l2.item_name ?? "MISSING"}", expected "${FEE_ITEM_NAME}"`);
    } else if (l2) {
      out.push(`(c) expense ${label} has fee 0 but carries an unexpected line 2 (amount_cents=${l2.cents})`);
    }
    return out;
  }
  const productLines = lines.filter((l) => l.item_name !== FEE_ITEM_NAME).map((l) => Number(l.cents));
  for (const r of rows) {
    const i = productLines.indexOf(c100(r.total_cost));
    if (i < 0) out.push(`(c) expense ${label}: fuel row ${r.id} (net ${c100(r.total_cost)}) is not a line of its Relay fill's document`);
    else productLines.splice(i, 1);
  }
  const feeLines = lines.filter((l) => l.item_name === FEE_ITEM_NAME).reduce((t, l) => t + Number(l.cents), 0);
  if (feeLines !== fee) out.push(`(c) expense ${label}: "${FEE_ITEM_NAME}" lines sum ${feeLines}, the fill's fees sum ${fee}`);
  const lineSum = lines.reduce((t, l) => t + Number(l.cents), 0);
  if (lineSum !== Number(doc.total_amount_cents)) out.push(`(c) expense ${label}: lines sum ${lineSum}, total ${doc.total_amount_cents}`);
  return out;
}

/** Pure — rule (e) for one posted document from its chain aggregates. */
export function checkChain(d) {
  const label = d.expense_number ?? d.id;
  const t = Number(d.total_amount_cents);
  const out = [];
  if (Number(d.pay_net_credit) !== t) out.push(`(e) expense ${label}: along its posting chain the payment account nets ${d.pay_net_credit} credit, expected the full total ${t}`);
  if (Number(d.expense_net_debit) !== t) out.push(`(e) expense ${label}: along its posting chain the expense accounts net ${d.expense_net_debit} debit, expected the full total ${t}`);
  if (Number(d.header_load_net_debit) !== t) out.push(`(e) expense ${label}: its header load carries ${d.header_load_net_debit} of the expense debit, expected the full total ${t} (fuel-expense ↔ load one-to-one)`);
  return out;
}

// The document's posting chain: every live posting carrying one of the (source_transaction_type, source_transaction_id) pairs its
// own journal entry carries — the original lines, the reclassify engine's reversing lines and its replacement lines.
export const CHAIN_SQL = `
  WITH d AS (
    SELECT e.id, e.expense_number, e.load_id, e.total_amount_cents, e.payment_account_uuid, e.journal_entry_id
      FROM accounting.expenses e
     WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.status = 'posted'
       AND e.journal_entry_id IS NOT NULL AND e.payment_account_uuid IS NOT NULL AND e.source_fuel_transaction_id IS NOT NULL
  ), src AS (
    SELECT DISTINCT d.id AS doc, p.source_transaction_type AS st, p.source_transaction_id AS sid
      FROM d JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = d.journal_entry_id
  ), chain AS (
    SELECT s.doc, p.account_id, p.debit_or_credit, p.amount_cents, p.load_id
      FROM src s
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = s.st AND p.source_transaction_id = s.sid
       AND p.operating_company_id = $1::uuid
      JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.voided_at IS NULL AND je.status = 'posted'
  )
  SELECT d.id::text, d.expense_number, d.total_amount_cents::text,
         COALESCE(sum(CASE WHEN c.account_id = d.payment_account_uuid THEN (CASE WHEN c.debit_or_credit = 'credit' THEN c.amount_cents ELSE -c.amount_cents END) END), 0)::text AS pay_net_credit,
         COALESCE(sum(CASE WHEN c.account_id <> d.payment_account_uuid THEN (CASE WHEN c.debit_or_credit = 'debit' THEN c.amount_cents ELSE -c.amount_cents END) END), 0)::text AS expense_net_debit,
         COALESCE(sum(CASE WHEN c.account_id <> d.payment_account_uuid AND c.load_id IS NOT DISTINCT FROM d.load_id
                           THEN (CASE WHEN c.debit_or_credit = 'debit' THEN c.amount_cents ELSE -c.amount_cents END) END), 0)::text AS header_load_net_debit
    FROM d LEFT JOIN chain c ON c.doc = d.id
   GROUP BY d.id, d.expense_number, d.total_amount_cents`;

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const rows = (await client.query(
      `SELECT ft.id::text, ft.relay_fuel_transaction_id::text, ft.total_cost::text, ft.fee_amount::text,
              (ft.archived_at IS NULL AND ft.voided_at IS NULL) AS is_live
         FROM fuel.fuel_transactions ft WHERE ft.operating_company_id = $1::uuid`, [USMCA_COMPANY_ID])).rows;
    const docs = (await client.query(
      `SELECT e.id::text, e.expense_number, e.total_amount_cents::text, e.source_fuel_transaction_id::text AS src,
              COALESCE((SELECT json_agg(json_build_object('seq', el.line_sequence, 'cents', el.amount_cents, 'item_name', it.item_name))
                          FROM accounting.expense_lines el LEFT JOIN catalogs.items it ON it.id = el.item_id
                         WHERE el.expense_id = e.id), '[]'::json) AS lines
         FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.source_fuel_transaction_id IS NOT NULL`, [USMCA_COMPANY_ID])).rows;

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const purchases = new Map();
    for (const r of rows) {
      const k = purchaseKey(r);
      if (!purchases.has(k)) purchases.set(k, { live: [], docs: [] });
      if (r.is_live) purchases.get(k).live.push(r);
    }
    for (const d of docs) {
      const r = rowById.get(d.src);
      if (!r) continue;
      if (!r.is_live) { failures.push(`(b) expense ${d.expense_number ?? d.id} is live on fuel row ${r.id}, which is voided or archived — a dead fuel row must carry zero live expenses`); continue; }
      purchases.get(purchaseKey(r)).docs.push({ ...d, lines: (d.lines ?? []).map((l) => ({ seq: Number(l.seq), cents: Number(l.cents), item_name: l.item_name })) });
    }
    let purchaseCount = 0, multiRow = 0;
    for (const p of purchases.values()) {
      if (!p.live.length) continue;
      purchaseCount++;
      if (p.live.length > 1) multiRow++;
      failures.push(...checkPurchase(p.live, p.docs));
    }
    for (const r of rows) if (r.is_live && !(c100(r.total_cost) > 0)) failures.push(`(d) live fuel row ${r.id} has total_cost=${r.total_cost} — must be > 0`);
    const chain = (await client.query(CHAIN_SQL, [USMCA_COMPANY_ID])).rows;
    for (const d of chain) failures.push(...checkChain(d));
    await client.query("ROLLBACK");

    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — ${purchaseCount} purchases (${multiRow} multi-product Relay fills) each carry exactly one live document at net+fee; 0 live documents on dead fuel rows; 0 live $0 fuel rows; ${chain.length} posted documents land along their posting chain (payment credit, expense debit, header load) for exactly their total.`);
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  let n = 0;
  const ok = (c, m) => { n++; if (!c) throw new Error(m); };
  ok(expenseTotalMatchesNetPlusFee(40150, "400.00", "1.50"), "net+fee total must match exactly");
  ok(!expenseTotalMatchesNetPlusFee(40000, "400.00", "1.50"), "PLANTED-RED: a total missing the fee must be caught");
  ok(!expenseTotalMatchesNetPlusFee(62461, "624.60", null), "PLANTED-RED: an off-by-one-cent total must be caught");
  ok(purchaseKey({ id: "f1", relay_fuel_transaction_id: "r1" }) === purchaseKey({ id: "f2", relay_fuel_transaction_id: "r1" }), "a Relay fill's product rows are one purchase");
  ok(purchaseKey({ id: "f1", relay_fuel_transaction_id: null }) !== purchaseKey({ id: "f2", relay_fuel_transaction_id: null }), "two hand rows are two purchases");

  // A Relay fill: diesel $500.00 + DEF $20.00 + $2.00 fee → ONE document of $522.00 (the live shape of 102 prod documents).
  const fill = [{ id: "dsl", total_cost: "500.00", fee_amount: "2.00" }, { id: "def", total_cost: "20.00", fee_amount: "0" }];
  const fillDoc = { id: "e1", expense_number: "13563-9", total_amount_cents: 52200,
    lines: [{ seq: 1, cents: 50000, item_name: "Diesel" }, { seq: 2, cents: 2000, item_name: "DEF" }, { seq: 3, cents: 200, item_name: FEE_ITEM_NAME }] };
  ok(checkPurchase(fill, [fillDoc]).length === 0, "the one document of a multi-product Relay fill passes");
  ok(checkPurchase([fill[1]], []).length === 1 && checkPurchase([fill[0]], [fillDoc]).length > 0, "the old per-row grain reds on the fill (why it was re-grained)");
  ok(checkPurchase(fill, []).some((f) => f.startsWith("(a)")), "PLANTED-RED: a fill with no document fails (a)");
  ok(checkPurchase(fill, [fillDoc, { ...fillDoc, id: "e2" }]).some((f) => f.startsWith("(a)")), "PLANTED-RED: a fill with two documents fails (a)");
  ok(checkPurchase(fill, [{ ...fillDoc, total_amount_cents: 52000, lines: fillDoc.lines.slice(0, 2) }]).some((f) => f.startsWith("(c)")), "PLANTED-RED: a fill document missing the fee fails (c)");
  ok(checkPurchase(fill, [{ ...fillDoc, lines: [{ seq: 1, cents: 52000, item_name: "Diesel" }, { seq: 2, cents: 200, item_name: FEE_ITEM_NAME }] }]).some((f) => f.includes("is not a line")), "PLANTED-RED: a product folded into another line fails (c)");
  const doc1366511 = { id: "e3", expense_number: "13665-11", total_amount_cents: 30200, lines: [{ seq: 1, cents: 30000, item_name: "Diesel" }, { seq: 2, cents: 200, item_name: FEE_ITEM_NAME }] };
  ok(checkPurchase([{ id: "ddc51b70", total_cost: "300.00", fee_amount: "0" }], [doc1366511]).length > 0, "PLANTED-RED: 13665-11 (row fee 0, document fee 200) fails (c)");
  ok(checkPurchase([{ id: "ddc51b70", total_cost: "300.00", fee_amount: "2.00" }], [doc1366511]).length === 0, "13665-11 after the fee repair passes");

  // (e) 13563-1 — reclassified from 13542 to 13563. Along the chain: pay 26946 Cr, expense 26946 Dr, header load 26946 Dr.
  ok(checkChain({ expense_number: "13563-1", total_amount_cents: 26946, pay_net_credit: 26946, expense_net_debit: 26946, header_load_net_debit: 26946 }).length === 0, "13563-1 read along its chain passes");
  ok(checkChain({ expense_number: "13563-1", total_amount_cents: 26946, pay_net_credit: 26946, expense_net_debit: 26946, header_load_net_debit: 0 }).length === 1, "PLANTED-RED: an expense still on the old load fails the load one-to-one");
  ok(checkChain({ expense_number: "x", total_amount_cents: 100, pay_net_credit: 0, expense_net_debit: 0, header_load_net_debit: 0 }).length === 3, "PLANTED-RED: a 0¢ chain fails all three");
  ok(/source_transaction_type = s\.st AND p\.source_transaction_id = s\.sid/.test(CHAIN_SQL) && !/reversed_by_line_id IS NULL/.test(CHAIN_SQL), "the chain follows the source pair and never drops line-reversed lines");
  console.log(`${LABEL} --selftest PASS (${n}/${n})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
