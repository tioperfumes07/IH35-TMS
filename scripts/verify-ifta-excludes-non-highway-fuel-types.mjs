#!/usr/bin/env node
/**
 * verify-ifta-excludes-non-highway-fuel-types — IFTA-GALLONS-01 (Lead, 2026-09-23).
 *
 * IFTA is GALLON-based and taxes MOTOR FUEL. Two defects lived in
 * apps/backend/src/ifta/ifta-state-gallons-aggregator.ts at the same time:
 *
 *   1. It never consulted fuel_type at all, so DEF (urea — an emissions consumable, not a motor
 *      fuel) was reported as taxable fuel. Measured live on USMCA 2026-09-23: 178 DEF rows /
 *      1,105.75 gallons, and FIVE jurisdictions (KY, PA, CO, IA, OH) appeared on the return
 *      carrying DEF gallons ONLY and no taxable fuel whatsoever.
 *
 *   2. It partitioned by `source` into three CTEs and then applied
 *      DISTINCT ON (state) ... ORDER BY state, priority — keeping ONE source per jurisdiction and
 *      silently DISCARDING the other two. Those populations are disjoint real purchases, not
 *      competing views of one purchase. Measured: the return carried 39,258.24 gallons against
 *      46,994.85 actual taxable diesel gallons — 7,736.61 gallons (16.5%) missing.
 *
 * This guard is STATIC (no DATABASE_URL, never skips) and asserts the shape of the fix:
 *   - the aggregator filters on fuel_type
 *   - it does not reintroduce DISTINCT ON over state
 *   - it does not reintroduce the source-priority partition
 *
 * It deliberately does NOT assert a dollar or gallon total: those move with real business every
 * day. It asserts the query SHAPE that made the totals wrong, which does not.
 */
// 03d (verify-no-silent-db-skip) correctly flagged this file: it names the DB-connection env var in
// its own prose, so the dynamic scanner treats it as a live-DB guard and then sees it exit 0 without
// one. That is a true reading of the text and a false reading of the guard. This check is PURELY
// STATIC — it reads one source file off disk and pattern-matches the SQL shape. It opens no
// connection, reads no row, and touches no money data, so there is no live result for it to skip and
// nothing for it to fake-green. Declaring it here is the mechanism 03d itself prescribes for exactly
// this case; it is not an offline bypass of a check that should have run.
export const ALLOW_OFFLINE_SKIP =
  "Static source-shape guard: reads ifta-state-gallons-aggregator.ts off disk and asserts the SQL shape. No DB connection, no row read, no money data.";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ifta-excludes-non-highway-fuel-types";
const TARGET = "apps/backend/src/ifta/ifta-state-gallons-aggregator.ts";

const fail = (m) => {
  console.error(`\n  ${LABEL} FAIL: ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`  ${LABEL} PASS: ${m}`);

export function analyse(src) {
  const problems = [];
  // Strip line comments so the explanatory header (which names the old shape) cannot satisfy or
  // trip any check below. Only real SQL/code counts.
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("--") && !l.trim().startsWith("*") && !l.trim().startsWith("//"))
    .join("\n");

  if (!/fuel_type/.test(code)) {
    problems.push(
      "the aggregator does not reference fuel_type at all — DEF (urea) and any other non-highway " +
        "consumable would be reported as taxable IFTA fuel. IFTA is gallon-based; this is a wrong return."
    );
  }
  if (/DISTINCT\s+ON\s*\(\s*state\s*\)/i.test(code)) {
    problems.push(
      "DISTINCT ON (state) is back. It keeps one source per jurisdiction and silently discards the " +
        "others, which measured 7,736.61 taxable gallons (16.5%) missing from the return."
    );
  }
  if (/\bAS\s+priority\b/i.test(code) || /ORDER\s+BY\s+state\s*,\s*priority/i.test(code)) {
    problems.push(
      "the source-priority partition is back. relay/loves/dispatch are disjoint real purchases, " +
        "not competing views of the same purchase — ranking them drops gallons."
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `WHERE LOWER(COALESCE(fuel_type,'')) IN ('diesel','gas') GROUP BY state, source_kind`;
  const noType = `WHERE operating_company_id = $1 GROUP BY state`;
  const distinct = `fuel_type IN ('diesel') SELECT DISTINCT ON (state) state FROM ranked ORDER BY state, priority`;
  const cases = [
    ["clean aggregator passes", analyse(good).length === 0],
    ["missing fuel_type filter is caught", analyse(noType).some((p) => p.includes("fuel_type"))],
    ["DISTINCT ON (state) is caught", analyse(distinct).some((p) => p.includes("DISTINCT ON"))],
    ["priority partition is caught", analyse(distinct).some((p) => p.includes("source-priority"))],
    [
      "a comment naming the old shape does not trip the check",
      analyse(`-- we removed DISTINCT ON (state) ORDER BY state, priority\n${good}`).length === 0,
    ],
  ];
  let bad = 0;
  for (const [name, passed] of cases) {
    console.log(`  ${passed ? "ok" : "FAIL"} — ${name}`);
    if (!passed) bad++;
  }
  if (bad) fail(`${bad} selftest case(s) failed`);
  ok(`selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) fail(`${TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
const problems = analyse(fs.readFileSync(abs, "utf8"));
if (problems.length) fail(problems.map((p) => `\n    - ${p}`).join(""));
ok(`${TARGET} filters fuel_type and carries no state-dedupe/source-priority drop`);
