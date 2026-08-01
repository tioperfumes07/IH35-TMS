#!/usr/bin/env node
/**
 * FLT-02-SEED-DRIFT — a db test that creates a unit must mark it `is_sample_data = true`.
 *
 * WHY THIS EXISTS: verify-real-owned-fleet-is-trk (verify-step 1559) asserts on LIVE data that every
 * real, non-sample unit is owned by TRK. In `verify:pre-commit` the backend db-tests run at step 13
 * and that guard runs at step 606 — SAME database. So any unit a db test inserts is still there when
 * the guard reads, and because `mdata.units.is_sample_data` is `NOT NULL DEFAULT false`, an
 * unmarked fixture unit counts as a REAL unit owned by an isolated test company rather than TRK.
 *
 * The result was a permanently RED `verify:local-ci` on main: "12 units visible; 6 real unit(s) not
 * owned by TRK", byte-identical on a clean checkout, while PROD was clean (87 of 87 real units owned
 * by TRK, positive control 186 == n_live_tup). A gate that is always red is a gate people learn to
 * skip — and skipping the local gate is precisely how "fix present, guard blind" defects reach main.
 * Fixing this makes red mean red.
 *
 * THE RULE: in a *.db.test.ts, an INSERT INTO mdata.units must include is_sample_data. Fixtures are
 * sample data by definition, and the fleet guard already excludes them — this just makes the tests
 * say so.
 *
 * NOT IN SCOPE: production code paths that create units (mdata/units.routes.ts,
 * samsara-master-sync, csv-seed-import, ...). Those create REAL units and must NOT be marked sample.
 * onboarding/seed-sample-data.ts already sets is_sample_data: true via its dynamic column builder —
 * verified by reading it, which is also why this guard only inspects test files: a literal-SQL scan
 * cannot see a dynamically-assembled INSERT and would false-positive on correct code.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "apps/backend");
const LABEL = "verify-db-test-units-are-sample-data";

export function auditSource(rel, src) {
  const problems = [];
  const re = /INSERT INTO mdata\.units\s*\(([\s\S]{0,400}?)\)\s*(?:\r?\n\s*)?VALUES/gi;
  for (const m of src.matchAll(re)) {
    const cols = m[1];
    if (!/\bis_sample_data\b/i.test(cols)) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(
        `${rel}:${line} db-test INSERT INTO mdata.units omits is_sample_data — the unit will count as ` +
          `a REAL unit for verify-real-owned-fleet-is-trk (which runs later against the same database) ` +
          `and turn that guard permanently red. Add is_sample_data and pass true.`
      );
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist") continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (n.endsWith(".db.test.ts")) out.push(f);
  }
  return out;
}

function auditTree() {
  const problems = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!/INSERT INTO mdata\.units/i.test(src)) continue;
    problems.push(...auditSource(relative(ROOT, file), src));
  }
  return problems;
}

function selftest() {
  const failures = [];

  const bad = "await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin) VALUES ($1,$2,$3,$4)`);";
  if (auditSource("planted.db.test.ts", bad).length === 0)
    failures.push("case1 FAIL — unmarked fixture unit insert not caught");

  const good = "await db.query(`INSERT INTO mdata.units (id,owner_company_id,unit_number,vin, is_sample_data) VALUES ($1,$2,$3,$4, true)`);";
  if (auditSource("planted.db.test.ts", good).length !== 0)
    failures.push("case2 FAIL — correctly-marked fixture insert was flagged");

  const multiline = "`INSERT INTO mdata.units (id, unit_number, vin, owner_company_id, is_sample_data)\n VALUES ($1,$2,$3,$4, true)`";
  if (auditSource("planted.db.test.ts", multiline).length !== 0)
    failures.push("case3 FAIL — multi-line marked insert was flagged");

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case4 FAIL — real db tests flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — unmarked insert caught; marked single-line and multi-line inserts clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every db-test unit fixture marks is_sample_data, so the fleet guard stays honest`);
}

main();
