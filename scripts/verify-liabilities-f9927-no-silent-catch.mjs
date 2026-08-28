#!/usr/bin/env node
/**
 * LIAB-F9927-SILENT-CATCH-SWEEP — GO-0012 leftover-unique (500/dead/silent), not Codex /dispatch, not
 * CC-3 System tab. Same fake-empty-200 class as the banking/factoring/settlements sweep
 * (BANK-F9514-9522, scripts/verify-banking-factoring-f9515-9518-no-silent-catch.mjs /
 * verify-banking-f9520-9522-no-silent-catch.mjs).
 *
 * apps/backend/src/liabilities/liabilities.routes.ts had 9 sites — 4 GET reads (dashboard/kpis,
 * active, by-driver, :id detail's 2 queries) and 3 PATCH mutations (hold, resume, mark-paid-off) plus
 * 1 POST (send-ack-request) — that each swallowed a real query failure with
 * `.catch(() => ({ rows: [] }))`. The GET routes rendered an honest-looking empty list / $0-KPI row on
 * a real DB failure. Worse, the 3 PATCH mutations turned a genuine UPDATE failure into a 404
 * "liability_not_found" — indistinguishable from the write actually succeeding against a
 * non-existent id. driver_finance.* / views.liabilities_* are foundational tables (no
 * relationExists()-gated "might not exist yet" case ever existed for any of these queries), so every
 * one of these catches was masking a real failure, never a legitimate empty/missing state.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const LIABILITIES_FILE = "apps/backend/src/liabilities/liabilities.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(liabilitiesSrcRaw) {
  const src = stripLineComments(liabilitiesSrcRaw);
  const failures = [];

  const fakeEmptyCatch = /\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/;
  if (fakeEmptyCatch.test(src)) {
    failures.push(`${LIABILITIES_FILE}: a fake-empty .catch() reappeared on a liabilities query (LIAB-F9927)`);
  }

  // Guard-out-of-sync tripwires: every route this finding covers must still exist.
  const requiredAnchors = [
    "views.liabilities_dashboard_kpis",
    "views.liabilities_active_with_context",
    "/api/v1/liabilities/:id",
    "/api/v1/liabilities/:id/send-ack-request",
    "/api/v1/liabilities/:id/hold",
    "/api/v1/liabilities/:id/resume",
    "/api/v1/liabilities/:id/mark-paid-off",
  ];
  const missingAnchors = requiredAnchors.filter((a) => !src.includes(a));
  if (missingAnchors.length > 0) {
    failures.push(`${LIABILITIES_FILE}: expected route/table anchor(s) not found — guard out of sync: ${missingAnchors.join(", ")}`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, LIABILITIES_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: liabilities-f9927-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: LIAB-F9927 silent-catch sites stay fixed");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: reintroduce the dashboard/kpis fake-empty catch.
  const offender = src.replace(
    "            LIMIT 1\n          `,\n          [companyId]\n        );\n      return res.rows[0] ?? null;",
    "            LIMIT 1\n          `,\n          [companyId]\n        )\n        .catch(() => ({ rows: [] }));\n      return res.rows[0] ?? null;"
  );
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (dashboard/kpis catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
