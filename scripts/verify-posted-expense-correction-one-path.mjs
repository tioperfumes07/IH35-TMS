#!/usr/bin/env node
/**
 * verify-posted-expense-correction-one-path — LEAD 443.129 E.
 *
 * A POSTED expense is corrected through ONE path, apps/backend/src/accounting/expense-correction.service.ts
 * (correctPostedExpense): the live entry is reversed through reverseJournalEntryNoFlip, the document keeps its
 * expense_number, the corrected entry is re-posted through the one posting-line writer under a `:correction:r<N>` batch
 * key, and one `expense.posted_corrected` audit row is written. Never an in-place overwrite.
 *
 * STATIC (this guard):
 *   1. the service reverses through reverseJournalEntryNoFlip, re-posts through insertPostingLineWithSpine under a
 *      `:correction:r` key, audits EXPENSE_CORRECTED_EVENT, and its correctable set is exactly driver_id / trailer_id / memo;
 *   2. expenses.routes.ts mounts POST /api/v1/expenses/:expenseId/correct and its PATCH sends a POSTED expense through
 *      correctPostedExpense (money fields refused by name);
 *   3. no other backend file overwrites an expense's driver: `UPDATE accounting.expenses ... driver_uuid =` outside the
 *      service is a FAIL, and an `UPDATE accounting.expense_lines ... driver_id =` outside it must be a fill-once
 *      `COALESCE(<alias>.driver_id, ...)` (it may fill an empty driver, never replace one).
 *
 * Run: node scripts/verify-posted-expense-correction-one-path.mjs [--selftest]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-posted-expense-correction-one-path";
const SERVICE = "apps/backend/src/accounting/expense-correction.service.ts";
const ROUTES = "apps/backend/src/accounting/expenses.routes.ts";
const BACKEND = "apps/backend/src";

export function checkService(src) {
  const p = [];
  if (!/export async function correctPostedExpense\(/.test(src)) p.push(`${SERVICE}: correctPostedExpense is missing.`);
  if (!/await reverseJournalEntryNoFlip\(/.test(src)) p.push(`${SERVICE}: the live entry is not reversed through reverseJournalEntryNoFlip.`);
  if (!/await postValidatedPostingLinesInClientTx\(/.test(src)) p.push(`${SERVICE}: the corrected entry is not re-posted through postValidatedPostingLinesInClientTx.`);
  if (!/:correction:r\$\{revision\}/.test(src)) p.push(`${SERVICE}: the re-post batch is not keyed <original>:correction:r<N>.`);
  if (!/EXPENSE_CORRECTED_EVENT,/.test(src) || !/EXPENSE_CORRECTED_EVENT = "expense\.posted_corrected"/.test(src)) p.push(`${SERVICE}: no expense.posted_corrected audit row.`);
  const set = src.match(/CORRECTABLE_EXPENSE_FIELDS = \[([^\]]*)\] as const/);
  const fields = set ? set[1].replace(/["\s]/g, "").split(",").filter(Boolean).sort().join(",") : "";
  if (fields !== "driver_id,memo,trailer_id") p.push(`${SERVICE}: the correctable set must be exactly driver_id, trailer_id, memo (found "${fields}").`);
  if (!/correction_field_not_supported/.test(src)) p.push(`${SERVICE}: a field outside the correctable set is not refused by name.`);
  if (!/period_closed/.test(src) || !/expense_bank_matched/.test(src)) p.push(`${SERVICE}: closed-period / bank-matched refusals are missing.`);
  return p;
}

export function checkRoutes(src) {
  const p = [];
  if (!/app\.post\("\/api\/v1\/expenses\/:expenseId\/correct"/.test(src)) p.push(`${ROUTES}: POST /api/v1/expenses/:expenseId/correct is not mounted.`);
  const patch = src.slice(src.indexOf('app.patch("/api/v1/expenses/:expenseId"'));
  const patchBody = patch.slice(0, patch.indexOf("\n  });\n") > 0 ? patch.indexOf("\n  });\n") : patch.length);
  if (!/await correctPostedExpense\(/.test(patchBody)) p.push(`${ROUTES}: PATCH does not send a posted expense through correctPostedExpense.`);
  if (!/posted_field_not_correctable/.test(patchBody)) p.push(`${ROUTES}: PATCH does not refuse a posted expense's money fields by name.`);
  return p;
}

/** Every `UPDATE accounting.expenses|expense_lines` statement that writes a driver, per file. */
export function driverOverwrites(files) {
  const p = [];
  for (const { path, src } of files) {
    if (path === SERVICE || /__tests__|\.test\.ts$/.test(path)) continue;
    const re = /UPDATE\s+accounting\.(expenses|expense_lines)\b([\s\S]*?)(?:WHERE|RETURNING|`)/g;
    let m;
    while ((m = re.exec(src))) {
      const [, table, setPart] = m;
      const line = src.slice(0, m.index).split("\n").length;
      // Heavy CI peel (443.192) — same rule as the line arm: a fill-once `driver_uuid = COALESCE(<alias>.driver_uuid, ...)`
      //   fills an EMPTY header driver and never replaces one, so it is not an overwrite. CC-3's 443.186 attribution
      //   re-stamp (e43a226b50, restampExpenseAttributionFromLoad) does exactly that and was flagged only because the header
      //   arm lacked the fill-once allowance the line arm already had.
      if (table === "expenses" && /\bdriver_uuid\s*=/.test(setPart) && !/\bdriver_uuid\s*=\s*COALESCE\(\s*(?:\w+\.)?driver_uuid\s*,/.test(setPart)) {
        p.push(`${path}:${line}: overwrites accounting.expenses.driver_uuid outside correctPostedExpense.`);
      }
      if (table === "expense_lines" && /\bdriver_id\s*=/.test(setPart) && !/\bdriver_id\s*=\s*COALESCE\(\s*(?:\w+\.)?driver_id\s*,/.test(setPart)) {
        p.push(`${path}:${line}: overwrites accounting.expense_lines.driver_id (not a fill-once COALESCE) outside correctPostedExpense.`);
      }
    }
  }
  return p;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === "node_modules") continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name)) out.push({ path: relative(ROOT, full), src: readFileSync(full, "utf8") });
  }
  return out;
}

const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const service = read(SERVICE);
  const routes = read(ROUTES);
  let ok = true;
  const ex = (n, c) => {
    if (!c) {
      console.error(`SELFTEST FAIL: ${n}`);
      ok = false;
    }
  };
  ex("real service passes", checkService(service).length === 0);
  ex("real routes pass", checkRoutes(routes).length === 0);
  ex("in-place reversal removed is caught", checkService(service.replace("await reverseJournalEntryNoFlip(", "await noop(")).length > 0);
  ex("repost bypasses the full engine is caught", checkService(service.replace("await postValidatedPostingLinesInClientTx(", "await noop(")).length > 0);
  ex("a money field added to the correctable set is caught",
    checkService(service.replace('["driver_id", "trailer_id", "memo"]', '["driver_id", "trailer_id", "memo", "amount_cents"]')).length > 0);
  ex("no audit row is caught", checkService(service.replaceAll("EXPENSE_CORRECTED_EVENT,", "OTHER,")).length > 0);
  ex("PATCH that no longer routes a posted expense through the correction is caught",
    checkRoutes(routes.replace("await correctPostedExpense(client, {\n            operatingCompanyId: oci,\n            expenseId,", "await somethingElse(client, {\n            operatingCompanyId: oci,\n            expenseId,")).length > 0);
  ex("a second driver writer is caught",
    driverOverwrites([{ path: "apps/backend/src/x.ts", src: "await q(`UPDATE accounting.expenses SET driver_uuid = $2 WHERE id = $1`)" }]).length === 1);
  ex("a line driver overwrite is caught",
    driverOverwrites([{ path: "apps/backend/src/y.ts", src: "await q(`UPDATE accounting.expense_lines SET driver_id = $2 WHERE expense_id = $1`)" }]).length === 1);
  ex("a fill-once line driver is allowed",
    driverOverwrites([{ path: "apps/backend/src/z.ts", src: "await q(`UPDATE accounting.expense_lines el SET driver_id = COALESCE(el.driver_id, e.driver_uuid) WHERE el.expense_id = e.id`)" }]).length === 0);
  ex("a fill-once header driver is allowed",
    driverOverwrites([{ path: "apps/backend/src/w.ts", src: "await q(`UPDATE accounting.expenses e SET driver_uuid = COALESCE(e.driver_uuid, $2) WHERE e.id = $1`)" }]).length === 0);
  ex("a header COALESCE that prefers the NEW driver (an overwrite) is caught",
    driverOverwrites([{ path: "apps/backend/src/v.ts", src: "await q(`UPDATE accounting.expenses e SET driver_uuid = COALESCE($2, e.driver_uuid) WHERE e.id = $1`)" }]).length === 1);
  ex("the correction service itself is exempt",
    driverOverwrites([{ path: SERVICE, src: "await q(`UPDATE accounting.expenses SET driver_uuid = $3 WHERE id = $1`)" }]).length === 0);
  console.log(ok ? `${LABEL} --selftest PASS (13/13)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const problems = [...checkService(read(SERVICE)), ...checkRoutes(read(ROUTES)), ...driverOverwrites(walk(join(ROOT, BACKEND)))];
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — a posted expense is corrected only by correctPostedExpense (reverse + re-post, same number, audited); no other driver overwrite.`);
