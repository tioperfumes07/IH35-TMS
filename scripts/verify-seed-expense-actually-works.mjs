#!/usr/bin/env node
/**
 * ROUND 178/190 (2026-09-28) — apps/backend/src/feed/seed-settlement-document.service.ts's
 * seedExpense() had FOUR independent, pre-existing bugs that meant it had NEVER successfully
 * created a single accounting.expenses row before this round: (1) a stray extra bind parameter
 * beyond the SQL's own distinct $N count -- node-postgres throws `bind message supplies N
 * parameters, but prepared statement "" requires N-1` on every real call; (2)
 * resolveByName(client, "mdata.vendors", "name", ...) used a column that does not exist
 * (mdata.vendors.vendor_name is the real column) -- silently swallowed by a `.catch(() => null)`
 * that was meant for "vendor genuinely not found," not "the SQL itself is broken," so the failure
 * only surfaced later as a misleading "current transaction is aborted" on the NEXT query; (3)
 * mdata.loads.load_trailer_equipment_id was written into accounting.expenses.trailer_id, but that
 * column's own FK constraint targets mdata.equipment -- a completely different, incompatible id
 * space (load_trailer_equipment_id's real target is catalogs.load_trailer_equipment) -- a
 * guaranteed FK violation for any load carrying a real trailer assignment; (4) the
 * accounting.expense_lines INSERT set item_id without its three required companion columns
 * (quantity, rate_cents, unit_of_measure), violating expense_lines_item_qty_rate_amount_check on
 * every call. Found and fixed together while importing real driver/carrier expense report data
 * this round -- see that file's own inline comments at each fix site.
 *
 * Static half (always runs, never skipped): asserts none of the four broken patterns are present
 * in the source.
 *
 * Live half (ALLOW_OFFLINE_SKIP; SKIPs cleanly with no DATABASE_URL): runs
 * apps/backend/scripts/verify-seed-expense-live-proof.ts, which calls the real seedExpense()
 * end-to-end against one real USMCA load INSIDE A TRANSACTION THAT IS ALWAYS ROLLED BACK.
 *
 * Run: node scripts/verify-seed-expense-actually-works.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const ALLOW_OFFLINE_SKIP = "the static source check above already runs unconditionally and is sufficient offline; the live half is a live-data invariant by design";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/feed/seed-settlement-document.service.ts";
const LABEL = "verify-seed-expense-actually-works";

export function checkStaticSource(src) {
  const problems = [];
  if (!/export async function seedExpense/.test(src)) {
    problems.push(`${SVC}: seedExpense is not exported -- callers outside this file cannot reuse the sanctioned engine`);
  }
  // Bug 1: the stray extra bind element. If this exact comment pattern is still followed
  // immediately by a 9-element array containing a bare `null` before line.date, the bind-count
  // bug has regressed.
  if (/\/\*unused placeholder\*\/\s*null/.test(src)) {
    problems.push(`${SVC}: stray "/*unused placeholder*/ null" bind-array element found -- this is exactly the bind-count mismatch bug (regression)`);
  }
  // Bug 2: wrong vendor column name.
  if (/resolveByName\(client,\s*"mdata\.vendors",\s*"name"/.test(src)) {
    problems.push(`${SVC}: resolveByName(..., "mdata.vendors", "name", ...) -- mdata.vendors has no "name" column, it is "vendor_name" (regression)`);
  }
  // Bug 3: incompatible trailer id space written into accounting.expenses.trailer_id.
  if (/trailer_id[^)]*\)[^;]*l\.(assigned_trailer_id|load_trailer_equipment_id)/s.test(src) && /INSERT INTO accounting\.expenses/.test(src)) {
    const insertIdx = src.indexOf("INSERT INTO accounting.expenses");
    const block = insertIdx === -1 ? "" : src.slice(insertIdx, insertIdx + 700);
    if (/trailer_id/.test(block)) {
      problems.push(`${SVC}: accounting.expenses INSERT references trailer_id again -- mdata.loads.load_trailer_equipment_id and accounting.expenses.trailer_id's own FK are incompatible id spaces (regression)`);
    }
  }
  // Bug 4: item_id without its required companion columns.
  const linesIdx = src.indexOf("INSERT INTO accounting.expense_lines");
  if (linesIdx !== -1) {
    const block = src.slice(linesIdx, linesIdx + 500);
    if (/item_id/.test(block) && !/quantity/.test(block)) {
      problems.push(`${SVC}: accounting.expense_lines INSERT sets item_id without quantity/rate_cents/unit_of_measure -- violates expense_lines_item_qty_rate_amount_check (regression)`);
    }
  }
  return problems;
}

export function checkStatic(root = ROOT) {
  let src;
  try {
    src = fs.readFileSync(path.join(root, SVC), "utf8");
  } catch {
    return [`${SVC}: missing`];
  }
  return checkStaticSource(src);
}

function checkLive() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LABEL} (live check): SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return [];
  }
  const proofScript = path.join(ROOT, "apps/backend/scripts/verify-seed-expense-live-proof.ts");
  let out;
  try {
    out = execFileSync("npx", ["tsx", proofScript], {
      cwd: path.join(ROOT, "apps/backend"),
      env: process.env,
      encoding: "utf8",
    });
  } catch (err) {
    return [`live proof script failed: ${err.stdout ?? err.message}`];
  }
  console.log(out.trim());
  const lastLine = out.trim().split("\n").pop();
  if (lastLine === "SKIP" || lastLine?.startsWith("SKIP")) return [];
  if (lastLine !== "PASS") return [`live proof did not print PASS (got: ${lastLine})`];
  return [];
}

export function runSelftest() {
  const cases = [
    { name: "seedExpense not exported", src: "async function seedExpense() {}", expectFail: true },
    { name: "stray unused-placeholder null bind element", src: "export async function seedExpense() {}\n[a, b, c, /*unused placeholder*/ null, d]", expectFail: true },
    { name: "wrong vendors column name", src: 'export async function seedExpense() {}\nresolveByName(client, "mdata.vendors", "name", opco, x)', expectFail: true },
    {
      name: "trailer_id still referenced in the expenses INSERT",
      src: 'export async function seedExpense() {}\nINSERT INTO accounting.expenses (\n  operating_company_id, trailer_id\n)\nSELECT $1, l.assigned_trailer_id',
      expectFail: true,
    },
    {
      name: "item_id without quantity in expense_lines INSERT",
      src: "export async function seedExpense() {}\nINSERT INTO accounting.expense_lines (\n  operating_company_id, item_id\n)\nVALUES ($1, $2)",
      expectFail: true,
    },
    {
      name: "correct: exported, no stray null, right column, no trailer_id, item_id with quantity",
      src: 'export async function seedExpense() {}\nresolveByName(client, "mdata.vendors", "vendor_name", opco, x)\nINSERT INTO accounting.expenses (\n  operating_company_id, unit_id\n)\nSELECT $1, l.assigned_unit_id\nINSERT INTO accounting.expense_lines (\n  operating_company_id, item_id, quantity, rate_cents, unit_of_measure\n)\nVALUES ($1, $2, 1, $3, \'each\')',
      expectFail: false,
    },
  ];
  let failures = 0;
  for (const c of cases) {
    const problems = checkStaticSource(c.src);
    const gotFail = problems.length > 0;
    if (gotFail !== c.expectFail) {
      failures += 1;
      console.error(`  SELFTEST FAIL: "${c.name}" expected fail=${c.expectFail}, got fail=${gotFail} (${JSON.stringify(problems)})`);
    }
  }
  if (failures > 0) {
    console.error(`${LABEL} --selftest FAIL (${failures} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
}

function main() {
  const problems = checkStatic();
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL (static):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (static): seedExpense exported, none of the 4 known bugs regressed.`);

  const liveProblems = checkLive();
  if (liveProblems.length > 0) {
    console.error(`${LABEL} FAIL (live):`);
    for (const p of liveProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  main();
}
