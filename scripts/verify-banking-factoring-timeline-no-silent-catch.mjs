#!/usr/bin/env node
/**
 * BANK-FACTORING-TIMELINE-SILENT-QUERY-SWALLOW
 *
 * GET /api/v1/banking/factoring-virtual/timeline swallowed its ONE query with
 * `.catch(() => ({ rows: [] }))`, turning ANY failure (schema drift on
 * accounting.factoring_advances, an RLS/permission change, a transient connection error) into a
 * normal 200 with an empty timeline — indistinguishable from "genuinely zero advances".
 * accounting.factoring_advances is a foundational table (migration 0061), not conditionally created,
 * so there is no legitimate "table might not exist yet" case here (unlike the sibling
 * views.factoring_balance_invoice_linkage check in the same file, which correctly uses to_regclass).
 * The frontend (BankingHome.tsx) already has a real factoringTimelineQuery.isError branch built for
 * this exact failure — it could never fire, because the backend never returned an error status. This
 * guard locks the swallow gone so that branch is reachable.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/banking/factoring-virtual.routes.ts";

export function check(src) {
  const failures = [];

  if (/FROM accounting\.factoring_advances[\s\S]{0,600}?\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(src)) {
    failures.push(`${ROUTES_FILE}: the /timeline handler's fake-empty .catch() on factoring_advances reappeared`);
  }
  if (!/app\.get\("\/api\/v1\/banking\/factoring-virtual\/timeline"/.test(src)) {
    failures.push(`${ROUTES_FILE}: /timeline route not found — guard out of sync`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
}

function run() {
  const src = readSrc();
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: banking-factoring-timeline-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: /api/v1/banking/factoring-virtual/timeline no longer masks a real query failure as an empty timeline"
  );
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  const offender = src.replace(
    "        values\n      );\n      return res.rows;",
    "        values\n      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));\n      return res.rows;"
  );
  if (offender === src) {
    console.error("FAIL(selftest): mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (fake-empty .catch() reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
