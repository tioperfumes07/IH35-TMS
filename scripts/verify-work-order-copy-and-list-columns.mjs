#!/usr/bin/env node
// U16 (owner UI register 2026-10-03) — "work order number, unit and trailer on every bill / expense list, and a stored copy
// of the work order opens from the document".
// Static (always):
//   1. both bill list queries and the expense list return unit / trailer / work order (own, else the one its lines carry)
//   2. the Bills list shows Work order (not hidden), Unit and Trailer; the Expenses list shows Unit, Trailer and WO
//   3. the copy is captured by ONE database writer: trg_capture_work_order_copy on bills, bill_lines, expenses,
//      expense_lines; the copy route renders it with the same letter builder as the live work order
//   4. the bill and expense detail pages open the stored copy (WorkOrderCopyLinks)
// Live (with DATABASE_URL): every work-order-linked bill / expense (header or line link) of a non-frozen company has a
// stored copy, and the four triggers exist.
import { readFileSync } from "node:fs";
import { NOT_FROZEN_SQL } from "./lib/bank-feed-state-machine.mjs";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree, whose static
// arm runs offline under ALLOW_OFFLINE_SKIP) and one that MUST fail (a bare fixture cwd — a guard
// that reports green with none of its inputs present is a vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_work_order_copy_and_list_columns(); }
async function selftest_verify_work_order_copy_and_list_columns() {
  const { runGuard, runGuardInFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const empty = runGuardInFixture(me);
  reportSelftest("verify_work_order_copy_and_list_columns", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "bare fixture fails closed", pass: statusOf(empty) !== 0, detail: statusOf(empty) !== 0 ? undefined : outputOf(empty).slice(-200) },
  ]);
}


export const ALLOW_OFFLINE_SKIP = "the enforcing half is static (writer, lists, detail pages) and always runs; the live half counts links without a copy";
const LABEL = "verify-work-order-copy-and-list-columns";
const fails = [];
const read = (p) => readFileSync(p, "utf8");

const bills = read("apps/backend/src/accounting/bills.service.ts");
if ((bills.match(/linked_settlement_display_id, dims\.\*/g) ?? []).length < 2 || (bills.match(/\$\{BILL_LIST_DIMS_JOIN_SQL\}/g) ?? []).length < 2) {
  fails.push("both bill list queries must select BILL_LIST_DIMS (unit / trailer / line work order)");
}
for (const col of ["list_unit_display_id", "list_trailer_display_id", "line_work_order_display_id"]) {
  if (!bills.includes(`AS ${col}`)) fails.push(`bill list no longer returns ${col}`);
}
const exp = read("apps/backend/src/accounting/expenses.routes.ts");
for (const [re, msg] of [
  [/un\.unit_number\s+AS unit_display_id/, "unit"],
  [/COALESCE\(e\.trailer_id, line_dims\.trailer_id\)/, "trailer (with the line fallback)"],
  [/COALESCE\(e\.linked_work_order_uuid, line_dims\.work_order_id\)/, "work order (with the line fallback)"],
]) if (!re.test(exp)) fails.push(`expense list no longer returns ${msg}`);

const billsPage = read("apps/frontend/src/pages/accounting/BillsPage.tsx");
const woCol = billsPage.slice(billsPage.indexOf('key: "linked_work_order_uuid"'), billsPage.indexOf('key: "linked_work_order_uuid"') + 400);
if (/defaultHidden:\s*true/.test(woCol)) fails.push("Bills list hides the Work order column again");
for (const key of ["list_unit_id", "list_trailer_id"]) if (!billsPage.includes(`key: "${key}"`)) fails.push(`Bills list lost the ${key} column`);
const expPage = read("apps/frontend/src/pages/accounting/ExpensesListPage.tsx");
for (const key of ["unit_display_id", "trailer_display_id", "linked_work_order_uuid"]) if (!expPage.includes(`key: "${key}"`)) fails.push(`Expenses list lost the ${key} column`);

const mig = read("db/migrations/202615380700_document_work_order_copies.sql");
for (const t of ["bills", "bill_lines", "expenses", "expense_lines"]) {
  if (!new RegExp(`CREATE TRIGGER trg_capture_work_order_copy AFTER INSERT OR UPDATE OF [a-z_, ]+ ON accounting\\.${t}\\b`).test(mig)) fails.push(`no capture trigger on accounting.${t}`);
}
const wo = read("apps/backend/src/work-orders/work-orders.routes.ts");
if (!/"\/api\/v1\/accounting\/work-order-copies\/:id\.html"[\s\S]{0,2500}buildPdfModel\(/.test(wo)) fails.push("the stored copy is not rendered with the WO letter builder");
for (const p of ["apps/frontend/src/pages/accounting/BillDetailPage.tsx", "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx"]) {
  if (!/<WorkOrderCopyLinks\b/.test(read(p))) fails.push(`${p.split("/").pop()} no longer opens the stored work order copy`);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
let liveLine = "live half skipped (no DATABASE_URL)";
if (url) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
  try {
    await c.connect();
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const reg = await c.query(`SELECT to_regclass('accounting.document_work_order_copies') IS NOT NULL AS ok`);
    if (!reg.rows[0].ok) {
      liveLine = "migration 202615380700 not applied on this database yet — live half runs after deploy";
    } else {
      const trg = await c.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_capture_work_order_copy'`);
      const missing = await c.query(
        `WITH links AS (
           SELECT 'bill' AS kind, b.id, b.linked_work_order_uuid AS wo, b.operating_company_id AS co FROM accounting.bills b WHERE b.linked_work_order_uuid IS NOT NULL
           UNION SELECT 'bill', b.id, l.work_order_uuid, b.operating_company_id FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id JOIN maintenance.work_order_lines l ON l.uuid = bl.linked_wo_line_uuid
           UNION SELECT 'expense', e.id, e.linked_work_order_uuid, e.operating_company_id FROM accounting.expenses e WHERE e.linked_work_order_uuid IS NOT NULL
           UNION SELECT 'expense', e.id, COALESCE(el.linked_work_order_uuid, l.work_order_uuid), e.operating_company_id FROM accounting.expense_lines el JOIN accounting.expenses e ON e.id = el.expense_id LEFT JOIN maintenance.work_order_lines l ON l.uuid = el.linked_wo_line_uuid WHERE COALESCE(el.linked_work_order_uuid, l.work_order_uuid) IS NOT NULL)
         SELECT count(*)::int AS links,
                count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM accounting.document_work_order_copies c WHERE c.source_kind = links.kind AND c.source_id = links.id AND c.work_order_id = links.wo))::int AS without_copy
           FROM links WHERE ${NOT_FROZEN_SQL("links.co")}`
      );
      const { links, without_copy } = missing.rows[0];
      if (trg.rows[0].n !== 4) fails.push(`expected 4 capture triggers, found ${trg.rows[0].n}`);
      if (without_copy > 0) fails.push(`${without_copy} of ${links} work-order links have no stored copy`);
      liveLine = `${links} work-order-linked documents, ${without_copy} without a stored copy; ${trg.rows[0].n} capture triggers`;
    }
    await c.query("ROLLBACK");
  } catch (err) {
    console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
    process.exit(1);
  } finally {
    await c.end().catch(() => {});
  }
  if (fails.length) {
    console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
}
console.log(`${LABEL}: PASS — bill / expense lists show work order, unit, trailer; the stored work-order copy is captured by one DB writer and opens from the document; ${liveLine}`);
