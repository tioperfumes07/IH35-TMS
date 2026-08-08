#!/usr/bin/env node
/**
 * GUARD: a settlement must record which loads it covers. ACCT-F271 / FAIL-W7a.
 *
 * FOUR writers create driver_finance.driver_settlements and only ONE — openLoadBookendedSettlement —
 * ever set first_load_id / first_load_number / last_load_id / last_load_number. weekly-close.routes,
 * settlements.routes and settlements-mvp.routes reference none of them (0 each). A settlement created
 * by any of those three can never say which loads it covers.
 *
 * Live: S-2026-0001 carries $1,705.55 with all four columns NULL. Settlement -> loads is a dead end,
 * and the reverse drill — "which settlement paid this load?" — has nothing to walk. Under the
 * connectivity law that is a broken both-way link on the money terminus.
 *
 * WHY THE SHARED ROLLUP AND NOT THE THREE WRITERS: aggregateSettlementTotals is called by every path
 * (pre-settlement routes, weekly close, bookend close) and runs AFTER lines exist — which is the first
 * moment the covered loads are knowable, since at INSERT time there are no lines to derive them from.
 * Patching three call sites is the silent-failure shape ACCT-F265 and ACCT-F268 were fixed to avoid:
 * the writer that forgets leaves NULL, which is indistinguishable from a settlement that genuinely
 * covers no load.
 *
 * THE GUARD ALSO DEMANDS COALESCE. Overwriting a bookend the load-bookended service already set would
 * corrupt its model — first_load_id there is the trip anchor (see ACCT-F266, where reuse depends on it).
 * Fill NULLs only.
 *
 * Run:  node scripts/verify-settlement-load-bookends-populated.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const LABEL = "verify-settlement-load-bookends-populated";

export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

/** The UPDATE that writes bookends onto driver_settlements. */
export function bookendUpdate(src) {
  const clean = stripComments(src);
  const re = /UPDATE\s+driver_finance\.driver_settlements[\s\S]{0,1200}?(?:WHERE[\s\S]{0,300}?)(?:;|`)/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    if (/first_load_id\s*=/.test(m[0])) return m[0];
  }
  return null;
}

export function collectProblems(src) {
  const clean = stripComments(src);
  const problems = [];
  if (!/aggregateSettlementTotals/.test(clean)) {
    problems.push(`${SRC}: aggregateSettlementTotals not found — if the shared rollup moved, move this guard with it (ACCT-F271).`);
    return problems;
  }
  const upd = bookendUpdate(src);
  if (!upd) {
    problems.push(
      `${SRC}: nothing populates first_load_id / last_load_id on driver_settlements outside the ` +
        `bookend creator. Three of four settlement writers set none of them, so a settlement cannot say ` +
        `which loads it covers — S-2026-0001 holds $1,705.55 with all four columns NULL, and the ` +
        `reverse drill "which settlement paid this load" has nothing to walk (FAIL-W7a).`
    );
    return problems;
  }
  if (!/COALESCE\s*\(\s*s\.first_load_id/i.test(upd)) {
    problems.push(
      `${SRC}: the bookend fill does not COALESCE. Overwriting first_load_id would corrupt the ` +
        `load-bookended model, where it is the TRIP ANCHOR that reuse depends on (ACCT-F266). Fill ` +
        `NULLs only (ACCT-F271).`
    );
  }
  if (!/FROM\s+driver_finance\.settlement_lines/i.test(upd + clean)) {
    problems.push(
      `${SRC}: bookends are not derived from the settlement's own lines. Deriving them from anything ` +
        `else risks asserting a load the settlement does not actually pay (ACCT-F271).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD =
    "export async function aggregateSettlementTotals(){}\n" +
    "await c.query(`WITH covered AS (SELECT sl.load_id FROM driver_finance.settlement_lines sl WHERE sl.settlement_id=$1) UPDATE driver_finance.driver_settlements s SET first_load_id = COALESCE(s.first_load_id, b.first_id), last_load_id = COALESCE(s.last_load_id, b.last_id) FROM bounds b WHERE s.id = $1;`);";
  const MISSING = "export async function aggregateSettlementTotals(){}\nawait c.query(`UPDATE driver_finance.driver_settlements SET gross_pay = $2 WHERE id = $1;`);";
  const NO_COALESCE =
    "export async function aggregateSettlementTotals(){}\n" +
    "await c.query(`WITH covered AS (SELECT sl.load_id FROM driver_finance.settlement_lines sl) UPDATE driver_finance.driver_settlements s SET first_load_id = b.first_id FROM bounds b WHERE s.id = $1;`);";

  if (collectProblems(GOOD).length !== 0) failures.push("the correct bookend fill was flagged");
  if (!collectProblems(MISSING).some((p) => /nothing populates first_load_id/.test(p))) {
    failures.push("a missing bookend fill was NOT caught");
  }
  if (!collectProblems(NO_COALESCE).some((p) => /does not COALESCE/.test(p))) {
    failures.push("an overwriting fill was accepted — it would corrupt the trip anchor");
  }
  const COMMENT = MISSING + "\n// UPDATE driver_finance.driver_settlements SET first_load_id = COALESCE(...)";
  if (!collectProblems(COMMENT).some((p) => /nothing populates/.test(p))) {
    failures.push("a comment faked the fill — false green");
  }
  if (!collectProblems("const x = 1;").some((p) => /not found/.test(p))) {
    failures.push("a missing rollup did not fail closed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 5/5 (correct passes, missing caught, overwrite caught, comment cannot fake, fails closed)`);
  process.exit(0);
}

const p = path.join(root, SRC);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${SRC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} settlement bookend gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — settlements record the loads they cover, derived from their own lines, NULL-fill only.`);
