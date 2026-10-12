#!/usr/bin/env node
// verify-expenses-projection-opco-lines — Cursor band 1738.
//
// FINDING (prod 2026-07-29, post-#3733): QBO_EXPENSES_PROJECTION_ENABLED was correctly ON for
// TRANSP; mdata.qbo_purchases had 28,047 rows; accounting.expenses stayed 0. The stage WAS running
// (qbo.sync_runs kind qbo_purchases_inbound_mirror succeeded at 01:00Z — look there, NOT
// mdata.qbo_sync_runs which is CoA/customer/vendor CDC only). Stage-2 projectPurchasesToExpenses
// failed every tick because accounting.expense_lines.operating_company_id is NOT NULL with no
// default, and both set-based line INSERTs omitted it — Postgres rejected the line write and the
// deferred header/line balance trigger rolled the WHOLE projection txn (headers included) back to 0.
//
// Do NOT flip the projection flag off to "fix" this. The flag is correct; the INSERT shape was not.
//
// Asserts: every INSERT INTO accounting.expense_lines inside projectPurchasesToExpenses includes
// operating_company_id; projection writes qbo.sync_runs kind qbo_purchases_expenses_projection.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PULLER = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-purchases-puller.ts");
const KIND = path.join(ROOT, "apps/backend/src/qbo-sync/qbo-purchases-sync-kind.ts");
const BACKFILL = path.join(ROOT, "scripts/ops/backfill-qbo-purchases-expenses.mjs");

function analyzeExpenseLineInserts(src, label, { requireProjectFn = false } = {}) {
  const failures = [];
  const fnIdx = src.indexOf("export async function projectPurchasesToExpenses");
  if (requireProjectFn && fnIdx < 0) {
    failures.push(`${label}: missing export async function projectPurchasesToExpenses`);
    return failures;
  }
  const body = fnIdx >= 0 ? src.slice(fnIdx) : src;
  const inserts = body.match(/INSERT\s+INTO\s+accounting\.expense_lines\s*\(([^)]+)\)/gi) ?? [];
  if (inserts.length === 0) {
    failures.push(`${label}: no INSERT INTO accounting.expense_lines — projection cannot write lines.`);
    return failures;
  }
  for (const ins of inserts) {
    if (!/\boperating_company_id\b/i.test(ins)) {
      failures.push(
        `${label}: expense_lines INSERT missing operating_company_id — NOT NULL/no-default; omission ` +
          `rolls the whole projection txn back to expenses=0 (prod 2026-07-29 defect).`
      );
    }
  }
  return failures;
}

export function analyzePullerRefuses(src, label) {
  const failures = [];
  const fnIdx = src.indexOf("export async function projectPurchasesToExpenses");
  if (fnIdx < 0) {
    failures.push(`${label}: missing export async function projectPurchasesToExpenses (callers must get a named refusal, not an import error)`);
    return failures;
  }
  if (!/^export async function projectPurchasesToExpenses[^\n]*\n[\s\S]{0,300}?refuseQboNativeWrite\(/m.test(src.slice(fnIdx))) {
    failures.push(`${label}: projectPurchasesToExpenses must refuse by name (refuseQboNativeWrite) — never project or silently no-op.`);
  }
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+accounting\.(?!qbo_)[a-z_]+/i.test(src)) {
    failures.push(`${label}: must not write any native accounting.* table (expenses / expense_lines) — QuickBooks is a read-only archive.`);
  }
  if (!/INSERT\s+INTO\s+mdata\.qbo_purchases/.test(src)) {
    failures.push(`${label}: must still upsert the mdata.qbo_purchases mirror.`);
  }
  return failures;
}

export function analyzeBackfillRefuses(src, label) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  if (/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+accounting\.(?!qbo_)[a-z_]+/i.test(code)) {
    failures.push(`${label}: must not write any native accounting.* table — QuickBooks is a read-only archive (443.137 9e).`);
  }
  if (!/QBO_NATIVE_WRITE_REFUSED/.test(code) || !/process\.exit\(1\)/.test(code)) {
    failures.push(`${label}: must refuse by name (QBO_NATIVE_WRITE_REFUSED) and exit 1.`);
  }
  return failures;
}

function analyze() {
  const failures = [];
  if (!fs.existsSync(PULLER)) {
    failures.push(`missing ${PULLER}`);
    return failures;
  }
  const puller = fs.readFileSync(PULLER, "utf8");
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: projectPurchasesToExpenses had to INSERT INTO
  //   accounting.expense_lines stamping operating_company_id, and record qbo.sync_runs under
  //   QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND.
  //   NEW: the puller must NOT write accounting.expenses / expense_lines (or any native accounting.* table) at
  //   all, and projectPurchasesToExpenses must REFUSE BY NAME (refuseQboNativeWrite). The owner backfill script
  //   below keeps its operating_company_id check (it is a separate, AUTH-gated path, still scanned).
  //   WHY: QuickBooks is a read-only archive; the projection/write was removed and its entry point refuses by name.
  failures.push(...analyzePullerRefuses(puller, "qbo-purchases-puller.ts"));
  if (fs.existsSync(KIND)) {
    const kindSrc = fs.readFileSync(KIND, "utf8");
    if (!/qbo_purchases_expenses_projection/.test(kindSrc)) {
      failures.push("qbo-purchases-sync-kind.ts missing qbo_purchases_expenses_projection kind constant.");
    }
  }
  // ACCT-F4431381 (Lead 443.137 item 9e, part 2) — OLD: the owner backfill script had to carry an
  //   INSERT INTO accounting.expense_lines that stamps operating_company_id (analyzeExpenseLineInserts).
  //   NEW: the backfill must REFUSE (QBO_NATIVE_WRITE_REFUSED, exit 1) and carry NO native accounting.*
  //   write at all; if the file is deleted later that is also fine (nothing can run it).
  //   WHY: the backfill was a second, hand-run copy of the QuickBooks -> native expense projection that
  //   part 1 removed from the puller. QuickBooks is a read-only archive; the strict check is now absence.
  if (fs.existsSync(BACKFILL)) {
    failures.push(...analyzeBackfillRefuses(fs.readFileSync(BACKFILL, "utf8"), "backfill-qbo-purchases-expenses.mjs"));
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `export async function projectPurchasesToExpenses() {
    INSERT INTO accounting.expense_lines (operating_company_id, expense_id) SELECT ...
  }
  QBO_PURCHASES_EXPENSES_PROJECTION_SYNC_KIND`;
  const bad = `export async function projectPurchasesToExpenses() {
    INSERT INTO accounting.expense_lines (expense_id, line_sequence) SELECT ...
  }`;
  const goodFails = analyzeExpenseLineInserts(good, "good").length;
  const badFails = analyzeExpenseLineInserts(bad, "bad").length;
  // ACCT-F4431380 (9e) plants on the REAL puller: it must pass as-is, and fail on a re-added native line write
  // and on a reverted refusal.
  const realPuller = fs.readFileSync(PULLER, "utf8");
  const realOk = analyzePullerRefuses(realPuller, "real").length === 0;
  const plantWrite = analyzePullerRefuses(
    realPuller + "\nconst P = `INSERT INTO accounting.expense_lines (operating_company_id, expense_id) VALUES ($1,$2)`;\n",
    "plant"
  ).length > 0;
  const plantNoRefuse = analyzePullerRefuses(realPuller.split("refuseQboNativeWrite(").join("noop("), "plant").length > 0;
  // ACCT-F4431381 (9e part 2) plants on the REAL backfill: it must pass as-is, fail on a re-added native
  // write, and fail when the refusal is removed; a comment-only mention must not trip it.
  const realBackfill = fs.existsSync(BACKFILL) ? fs.readFileSync(BACKFILL, "utf8") : 'console.error("QBO_NATIVE_WRITE_REFUSED"); process.exit(1);';
  const backfillOk = analyzeBackfillRefuses(realBackfill, "real").length === 0;
  const backfillPlantWrite =
    analyzeBackfillRefuses(realBackfill + "\nconst P = `INSERT INTO accounting.expenses (id) VALUES ($1)`;\n", "plant").length > 0;
  const backfillPlantNoRefuse = analyzeBackfillRefuses(realBackfill.split("QBO_NATIVE_WRITE_REFUSED").join("X"), "plant").length > 0;
  const backfillNearMiss =
    analyzeBackfillRefuses(realBackfill + "\n// formerly INSERT INTO accounting.expense_lines (history)\n", "near").length === 0;
  if (goodFails === 0 && badFails > 0 && realOk && plantWrite && plantNoRefuse && backfillOk && backfillPlantWrite && backfillPlantNoRefuse && backfillNearMiss) {
    console.log("verify-expenses-projection-opco-lines --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-expenses-projection-opco-lines --selftest: FAIL", { goodFails, badFails, realOk, plantWrite, plantNoRefuse, backfillOk, backfillPlantWrite, backfillPlantNoRefuse, backfillNearMiss });
  process.exit(1);
}

const failures = analyze();
if (failures.length) {
  console.error("FAIL verify-expenses-projection-opco-lines:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "PASS verify-expenses-projection-opco-lines — QBO purchases puller writes no native expense rows and its " +
    "projection refuses by name (9e); the QBO purchases backfill refuses by name with no native write; sync kind present."
);
