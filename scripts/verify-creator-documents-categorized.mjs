#!/usr/bin/env node
/**
 * verify-creator-documents-categorized — RULING 443.66 (owner order 2026-10-11 15:02 CT: every seeded document accurately
 * and correctly categorized), CC-3. Law: claude/09-22-2026-ITEMS-VS-ACCOUNTS — the detail lives in the ITEM, the rollup in
 * the ACCOUNT; every line carries its item.
 *
 * STATIC (every run): the writers that seed a Creator settlement write the categorization —
 *   S1 payrun close reads sl.item_id into every pay row and the A/P chain puts it on the bill line (D1);
 *   S2 the Creator writes the item on every reimbursement settlement line (D1);
 *   S3 the linehaul invoice line carries the "Line Haul" item (D3);
 *   S4 the Creator's posted-stamp writes status 'posted' with posting_status 'posted' (D4);
 *   S5 the fuel document lines carry driver / unit / trailer, and the Creator resolves the document's trailer (D5).
 * LIVE (read only), over every document a Settlement Creator post produced (audit 'settlement_creator.posted'):
 *   L1 every expense / bill / invoice line has an item;
 *   L2 the line's account = the item's default account (expense / bill: expense account; invoice: income account) — D2;
 *   L3 expense status = posting_status;
 *   L4 every expense line carries the driver / unit / trailer its header has.
 *   LISTED (not a failure): headers with no trailer (the settlement document's trailer number is not in the equipment
 *   master — owner data, never seeded by a coder).
 * --selftest plants each failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "categorization of posted Creator documents is live data — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-creator-documents-categorized";
const F = {
  payrun: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  apchain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  fromLoad: "apps/backend/src/accounting/from-load.ts",
  fuelDoc: "apps/backend/src/fuel/fuel-expense-document.service.ts",
  // 443.130 #3 follow-up — old: expenses.routes.ts; new: the writer lives in expense-writer.service.ts (createExpenseInClientTx moved there so a service never imports a route)
  writer: "apps/backend/src/accounting/expense-writer.service.ts",
};

export function staticFailures(src) {
  const f = [];
  if (!/sl\.item_id::text AS item_id/.test(src.payrun) || !/itemId: r\.item_id/.test(src.payrun)) f.push(`S1 ${F.payrun}: pay rows do not carry the settlement line's item`);
  if (!/itemId: l\.itemId, quantity: 1, rateCents: l\.amountCents, unitOfMeasure: "each"/.test(src.apchain)) f.push(`S1 ${F.apchain}: the A/P bill line does not carry the pay row's item`);
  if ((src.creator.match(/'reimbursement', \$3, \$4, true, false[^`]*?item_id|load_id, posting_account_id, item_id, quantity, rate_cents, unit_of_measure/g) ?? []).length < 1
      || !/item_id, quantity, rate_cents, unit_of_measure\n\s*\)\n\s*VALUES \(\$1::uuid, \$2::uuid, 'reimbursement'/.test(src.creator))
    f.push(`S2 ${F.creator}: a reimbursement settlement line is written without its item`);
  if (!/item_name = 'Line Haul'/.test(src.fromLoad) || !/display_order,\s*\n\s*item_id,/.test(src.fromLoad)) f.push(`S3 ${F.fromLoad}: the linehaul invoice line is written without the Line Haul item`);
  if (!/SET posting_status = 'posted', status = 'posted'/.test(src.creator)) f.push(`S4 ${F.creator}: the posted-stamp leaves status 'draft'`);
  if ((src.fuelDoc.match(/driver_id, unit_id, trailer_id/g) ?? []).length < 3) f.push(`S5 ${F.fuelDoc}: a fuel document line is written without driver / unit / trailer`);
  if (!/resolveCreatorTrailerId\(client, draft\.operating_company_id, draft\.trailer_equipment_number\)/.test(src.creator)) f.push(`S5 ${F.creator}: the Creator does not resolve the document's trailer`);
  // 443.84 #2: a load-attributed Creator expense is numbered on its load's spine; EXP-YYYY-##### only without a load.
  // 443.110 G13: the company expense goes through the shared writer with its load, which numbers it on the load's spine
  // (generateExpenseNumber(client, body.load_id, ...)) and writes its expense_load_links row.
  if (!/await createExpenseInClientTx\(\s*client,\s*\{[\s\S]{0,900}load_id: loadId,/.test(src.creator) || !/generateExpenseNumber\(client, body\.load_id, body\.operating_company_id\)/.test(src.writer))
    f.push(`S6 ${F.creator}: a load-attributed company expense is not numbered on its load's spine (shared writer with load_id -> generateExpenseNumber)`);
  return f;
}

/** rows: { kind, id, item_id, line_account, item_account, status?, posting_status?, miss_driver?, miss_unit?, miss_trailer? } */
export function liveFailures(rows) {
  const f = [];
  const seenExpense = new Set();
  for (const r of rows) {
    if (!r.item_id) f.push(`L1 ${r.kind} line ${r.id}: no item`);
    else if (r.line_account !== r.item_account) f.push(`L2 ${r.kind} line ${r.id}: account ${r.line_account_number ?? r.line_account} != item "${r.item_name}" default ${r.item_account_number ?? r.item_account ?? "none"}`);
    if (r.kind === "expense" && r.status !== r.posting_status && !seenExpense.has(r.expense_id) && seenExpense.add(r.expense_id)) f.push(`L3 expense ${r.expense_id}: status '${r.status}' / posting_status '${r.posting_status}'`);
    if (r.miss_driver || r.miss_unit || r.miss_trailer)
      f.push(`L4 expense line ${r.id}: missing ${[r.miss_driver && "driver", r.miss_unit && "unit", r.miss_trailer && "trailer"].filter(Boolean).join(" / ")} its header has`);
  }
  return f;
}

const SCOPE = `
  WITH ev AS (
    SELECT DISTINCT ON (payload->>'source_document_ref') payload->>'source_document_ref' AS ref, (payload->>'resource_id')::uuid AS sid,
           (payload->>'operating_company_id')::uuid AS co, payload->'invoice_ids' AS inv
      FROM audit.audit_events WHERE event_class = 'driver_finance.settlement_creator.posted'
     ORDER BY payload->>'source_document_ref', created_at DESC),
  live AS (SELECT ev.* FROM ev JOIN driver_finance.driver_settlements ds ON ds.id = ev.sid AND ds.voided_at IS NULL)`;

async function measure(client) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const exp = (await client.query(`${SCOPE}
    SELECT 'expense' AS kind, el.id::text, e.id::text AS expense_id, el.item_id::text, i.item_name,
           el.expense_account_uuid::text AS line_account, la.account_number AS line_account_number,
           i.default_expense_account_id::text AS item_account, ia.account_number AS item_account_number,
           e.status, e.posting_status,
           (e.driver_uuid IS NOT NULL AND el.driver_id IS NULL) AS miss_driver,
           (e.unit_id IS NOT NULL AND el.unit_id IS NULL) AS miss_unit,
           (e.trailer_id IS NOT NULL AND el.trailer_id IS NULL) AS miss_trailer,
           (e.trailer_id IS NULL) AS header_no_trailer, e.document_trailer_number
      FROM live JOIN accounting.expenses e ON e.operating_company_id = live.co AND e.settlement_no = live.ref AND e.voided_at IS NULL
      JOIN accounting.expense_lines el ON el.expense_id = e.id
      LEFT JOIN catalogs.items i ON i.id = el.item_id
      LEFT JOIN catalogs.accounts la ON la.id = el.expense_account_uuid
      LEFT JOIN catalogs.accounts ia ON ia.id = i.default_expense_account_id`)).rows;
  const bill = (await client.query(`${SCOPE}
    SELECT 'bill' AS kind, bl.id::text, bl.item_id::text, i.item_name,
           bl.account_id::text AS line_account, la.account_number AS line_account_number,
           i.default_expense_account_id::text AS item_account, ia.account_number AS item_account_number
      FROM live JOIN driver_finance.driver_settlement_gl_bills g ON g.settlement_id = live.sid AND g.superseded_at IS NULL
      JOIN accounting.bills b ON b.id = g.accounting_bill_id AND b.voided_at IS NULL
      JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.voided_at IS NULL
      LEFT JOIN catalogs.items i ON i.id = bl.item_id
      LEFT JOIN catalogs.accounts la ON la.id = bl.account_id
      LEFT JOIN catalogs.accounts ia ON ia.id = i.default_expense_account_id`)).rows;
  const inv = (await client.query(`${SCOPE}
    SELECT 'invoice' AS kind, il.id::text, il.item_id::text, i.item_name,
           il.account_id::text AS line_account, la.account_number AS line_account_number,
           i.default_income_account_id::text AS item_account, ia.account_number AS item_account_number
      FROM live JOIN accounting.invoices inv ON inv.id::text IN (SELECT jsonb_array_elements_text(COALESCE(live.inv, '[]'::jsonb))) AND inv.voided_at IS NULL
      JOIN accounting.invoice_lines il ON il.invoice_id = inv.id AND il.soft_deleted_at IS NULL
      LEFT JOIN catalogs.items i ON i.id = il.item_id
      LEFT JOIN catalogs.accounts la ON la.id = il.account_id
      LEFT JOIN catalogs.accounts ia ON ia.id = i.default_income_account_id`)).rows;
  await client.query("ROLLBACK");
  return { exp, bill, inv };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, readFileSync(join(ROOT, rel), "utf8")]));
  if (process.argv.includes("--selftest")) {
    const plant = (k, from, to) => ({ ...src, [k]: src[k].split(from).join(to) });
    const ok = { kind: "bill", id: "b1", item_id: "i1", item_name: "Driver Pay-X", line_account: "a6890", item_account: "a6890" };
    const cases = [
      ["the real writers pass the static rules", staticFailures(src).length === 0],
      ["a pay row without its item fails S1", staticFailures(plant("payrun", "itemId: r.item_id", "x: 1")).some((x) => x.startsWith("S1"))],
      ["a bill line without the item fails S1", staticFailures(plant("apchain", 'unitOfMeasure: "each"', "u: 1")).some((x) => x.startsWith("S1"))],
      ["a linehaul line without Line Haul fails S3", staticFailures(plant("fromLoad", "item_name = 'Line Haul'", "1=1")).some((x) => x.startsWith("S3"))],
      ["a posted stamp without status fails S4", staticFailures(plant("creator", "status = 'posted', posted_at", "posted_at")).some((x) => x.startsWith("S4"))],
      ["a load expense numbered EXP-YYYY fails S6", staticFailures(plant("creator", "        load_id: loadId,\n", "        load_id: null,\n")).some((x) => x.startsWith("S6"))],
      ["a fuel line without driver/unit/trailer fails S5", staticFailures(plant("fuelDoc", "driver_id, unit_id, trailer_id", "x")).some((x) => x.startsWith("S5"))],
      ["a categorized line passes", liveFailures([ok]).length === 0],
      ["a line without an item fails L1", liveFailures([{ ...ok, item_id: null }]).some((x) => x.startsWith("L1"))],
      ["an item whose default is not the line's account fails L2", liveFailures([{ ...ok, item_account: "a5100" }]).some((x) => x.startsWith("L2"))],
      ["a posted expense reading draft fails L3", liveFailures([{ ...ok, kind: "expense", status: "draft", posting_status: "posted" }]).some((x) => x.startsWith("L3"))],
      ["an expense line missing its header's unit fails L4", liveFailures([{ ...ok, kind: "expense", status: "posted", posting_status: "posted", miss_unit: true }]).some((x) => x.startsWith("L4"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, p]) => !p).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const sf = staticFailures(src);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    let lf = [];
    let m = null;
    try {
      m = await measure(client);
      lf = liveFailures([...m.exp, ...m.bill, ...m.inv]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      lf = [`L0 the live check could not run — ${err?.message ?? err}`];
    }
    if (m) {
      const noTrl = new Set(m.exp.filter((r) => r.header_no_trailer).map((r) => r.expense_id)).size;
      // 443.80 #1: a header with no trailer must carry the trailer number as printed on its settlement document.
      const bare = [...new Set(m.exp.filter((r) => r.header_no_trailer && !r.document_trailer_number).map((r) => r.expense_id))];
      for (const id of bare) lf.push(`L5 expense ${id}: no trailer and no printed trailer number`);
      const printed = [...new Set(m.exp.filter((r) => r.header_no_trailer && r.document_trailer_number).map((r) => r.document_trailer_number))];
      if (printed.length) console.log(`  LISTED: trailer numbers printed on the documents, not in the equipment master: ${printed.join(", ")}`);
      console.log(`  checked: ${m.exp.length} expense line(s), ${m.bill.length} bill line(s), ${m.inv.length} invoice line(s); LISTED: ${noTrl} expense header(s) with no trailer (document trailer not in the equipment master)`);
      const byRule = {};
      for (const x of lf) byRule[x.slice(0, 2)] = (byRule[x.slice(0, 2)] ?? 0) + 1;
      if (lf.length) console.log(`  by rule: ${JSON.stringify(byRule)}`);
    }
    const all = [...sf, ...lf];
    if (all.length) { console.error(`${LABEL}: FAIL (${all.length})\n  ${all.slice(0, 60).join("\n  ")}${all.length > 60 ? `\n  … ${all.length - 60} more` : ""}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — every Creator-born line has its item on the item's account, status = posting_status, driver / unit / trailer from the header.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
