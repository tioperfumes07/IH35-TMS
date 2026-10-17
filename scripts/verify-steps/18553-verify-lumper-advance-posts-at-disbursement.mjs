#!/usr/bin/env node
/**
 * LEAD 443.184 G15 — a lumper advance is the load's lumper expense the moment it is disbursed, on every path.
 *
 * Measured on main before this step: PATCH /cash-advances/:id/mark-disbursed flipped a wizard lumper advance to
 * 'disbursed' and posted nothing; the core disburse returned early with DRIVER_ADVANCE_GL_POSTING_ENABLED off (no
 * expense); the create path still wrote "expense posting HOLD" / "expense JE HOLD" into the liability, schedule and memo.
 *   1. No "HOLD" wording for a lumper advance in cash-advance-create.ts.
 *   2. postLumperAdvanceAtDisbursementInClientTx posts the advance's own driver_advance entry when none is live, then
 *      recordLumperAdvanceExpenseInClientTx (the expense writer on the load).
 *   3. mark-disbursed calls it for a lumper advance and refuses one when GL posting is off.
 *   4. The core disburse refuses a lumper advance with GL posting off BEFORE its UPDATE, and still records the expense.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  create: "apps/backend/src/cash-advances/cash-advance-create.ts",
  service: "apps/backend/src/cash-advances/lumper-advance-expense.service.ts",
  routes: "apps/backend/src/cash-advances/cash-advances.routes.ts",
  core: "apps/backend/src/cash-advances/cash-advance-disburse.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  if (/expense posting HOLD|expense JE HOLD/.test(s.create)) p.push(`${F.create}: a lumper advance is labelled HOLD — it posts at disbursement (1)`);
  const helper = s.service.match(/export async function postLumperAdvanceAtDisbursementInClientTx\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!helper || !/source_transaction_type: "driver_advance"/.test(helper) || !/reversed_by_line_id IS NULL/.test(helper) || !/return recordLumperAdvanceExpenseInClientTx\(client, input\)/.test(helper))
    p.push(`${F.service}: postLumperAdvanceAtDisbursementInClientTx must post the advance's entry when none is live, then the lumper expense (2)`);
  const md = s.routes.slice(s.routes.indexOf('"/api/v1/cash-advances/:id/mark-disbursed"'));
  if (!/if \(isLumper\) \{\s*await postLumperAdvanceAtDisbursementInClientTx\(client,/.test(md) || !/lumper_advance_requires_gl_posting/.test(md))
    p.push(`${F.routes}: mark-disbursed must post a lumper advance as the load's expense (or refuse with GL off) (3)`);
  const coreRefuse = s.core.indexOf('error: "lumper_advance_requires_gl_posting"');
  const coreUpdate = s.core.indexOf("SET disbursement_status = 'disbursed'");
  if (coreRefuse < 0 || coreUpdate < 0 || coreRefuse > coreUpdate || !/await recordLumperAdvanceExpenseInClientTx\(client,/.test(s.core))
    p.push(`${F.core}: the core disburse must refuse a lumper advance with GL off before its UPDATE and record the expense otherwise (4)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["HOLD back", { create: base.create + "\nconst x = 'expense JE HOLD until CPA/Neon';\n" }],
    ["helper skips expense", { service: base.service.replace("return recordLumperAdvanceExpenseInClientTx(client, input);", "return { recorded: false, reason: 'not_a_lumper' } as never;") }],
    ["mark-disbursed posts nothing", { routes: base.routes.replace("await postLumperAdvanceAtDisbursementInClientTx(client,", "void (client,") }],
    ["core silent skip", { core: base.core.replace('error: "lumper_advance_requires_gl_posting"', 'error: "x"') }],
  ];
  for (const [n, src] of plants) {
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-lumper-advance-posts-at-disbursement FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-lumper-advance-posts-at-disbursement PASS: every disburse path posts a lumper advance as the load's expense; no HOLD (G15)");
}
