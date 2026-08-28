#!/usr/bin/env node
/**
 * LIAB-F9927-SILENT-CATCH-SWEEP (fuel leg) — GO-0012 leftover-unique, continuing the sweep started on
 * liabilities.routes.ts (#17110) and cash-advances.routes.ts (#17113).
 *
 * apps/backend/src/fuel/planner.routes.ts's dashboard route queried fuel.loves_prices_daily directly
 * (no hasRelation() gate, unlike the two genuinely-conditional tables elsewhere in this same file —
 * fuel.recommended_stops and views.fuel_planner_active_routes, which correctly DO gate) and swallowed
 * any failure into `{ rows: [{ synced_at: null }] }`. fuel.loves_prices_daily is foundational
 * (confirmed live via to_regclass), and MAX(updated_at) on an existing-but-empty table already returns
 * NULL with no error — so the catch never legitimately distinguished "never synced" from "query broke".
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PLANNER_FILE = "apps/backend/src/fuel/planner.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(plannerSrcRaw) {
  const src = stripLineComments(plannerSrcRaw);
  const failures = [];

  if (/FROM fuel\.loves_prices_daily[\s\S]{0,200}?\.catch\(/.test(src)) {
    failures.push(`${PLANNER_FILE}: a fake-default .catch() reappeared on the loves_prices_daily sync-timestamp read (LIAB-F9927 fuel leg)`);
  }

  // Tripwire: the two genuinely-conditional tables in this file must keep their hasRelation() gate —
  // this guard is only about the loves_prices_daily site, not a blanket "no .catch anywhere" rule.
  const requiredAnchors = [
    'hasRelation(client, "views.fuel_planner_active_routes")',
    'hasRelation(client, "fuel.recommended_stops")',
    "FROM fuel.loves_prices_daily",
  ];
  const missingAnchors = requiredAnchors.filter((a) => !src.includes(a));
  if (missingAnchors.length > 0) {
    failures.push(`${PLANNER_FILE}: expected anchor(s) not found — guard out of sync: ${missingAnchors.join(", ")}`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, PLANNER_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: fuel-planner-loves-sync-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: fuel planner loves_prices_daily silent-catch site stays fixed");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  const offender = src.replace(
    "          WHERE operating_company_id = $1::uuid\n        `,\n        [companyId]\n      );\n\n      return {",
    "          WHERE operating_company_id = $1::uuid\n        `,\n        [companyId]\n      ).catch(() => ({ rows: [{ synced_at: null }] }));\n\n      return {"
  );
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (loves_prices_daily catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
