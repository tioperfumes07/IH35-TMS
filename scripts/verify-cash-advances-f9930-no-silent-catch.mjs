#!/usr/bin/env node
/**
 * LIAB-F9927-SILENT-CATCH-SWEEP (cash-advances leg) — GO-0012 leftover-unique, continuing the sweep
 * that started with liabilities.routes.ts (#17110). Same fake-empty-200 class as BANK-F9514-9522.
 *
 * apps/backend/src/cash-advances/cash-advances.routes.ts had 8 `.catch(...)` sites. 7 are read-only
 * (dashboard/kpis, list, unpaid-bills, GET /:id's 2 queries, mark-disbursed's re-fetch) and are fixed
 * here — the query now throws naturally on a real failure. The 8th (PATCH /:id/reverse's
 * settlement-deduction-count guard, `.catch(() => ({ rows: [{ cnt: 0 }] }))`) is a live financial
 * write-path gate and is DELIBERATELY left untouched (Rule 13 financial law — routed to the board as
 * CASH-ADV-F9930-REVERSE-GUARD-NEVER-BLOCKS for CC-1, not fixed here) — this guard must NOT flag its
 * continued presence as a regression.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const CASH_ADVANCES_FILE = "apps/backend/src/cash-advances/cash-advances.routes.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(cashAdvancesSrcRaw) {
  const src = stripLineComments(cashAdvancesSrcRaw);
  const failures = [];

  // Only the fake-EMPTY-rows shape is forbidden — the financial reverse-guard's fake-{cnt:0} shape is
  // an intentionally untouched, separately-tracked defect (CASH-ADV-F9930) and must stay present.
  const fakeEmptyRowsCatch = /\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/;
  if (fakeEmptyRowsCatch.test(src)) {
    failures.push(`${CASH_ADVANCES_FILE}: a fake-empty .catch() reappeared on a cash-advances read query (LIAB-F9927 cash-advances leg)`);
  }

  // Tripwire: the deliberately-untouched financial guard must still exist, unchanged in shape — if it
  // disappears the "not bundled here, routed to CC-1" claim in the PR/board row goes stale.
  if (!/\.catch\(\s*\(\)\s*=>\s*\(\{\s*rows:\s*\[\{\s*cnt:\s*0\s*\}\]/.test(src)) {
    failures.push(`${CASH_ADVANCES_FILE}: expected untouched financial reverse-guard catch (CASH-ADV-F9930) not found — guard out of sync`);
  }

  const requiredAnchors = [
    "views.cash_advances_dashboard_kpis",
    "views.cash_advances_with_context",
    "/api/v1/cash-advances/unpaid-bills",
    "/api/v1/cash-advances/:id",
    "/api/v1/cash-advances/:id/mark-disbursed",
    "/api/v1/cash-advances/:id/reverse",
  ];
  const missingAnchors = requiredAnchors.filter((a) => !src.includes(a));
  if (missingAnchors.length > 0) {
    failures.push(`${CASH_ADVANCES_FILE}: expected route/table anchor(s) not found — guard out of sync: ${missingAnchors.join(", ")}`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, CASH_ADVANCES_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: cash-advances-f9930-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: LIAB-F9927 (cash-advances leg) silent-catch sites stay fixed; CASH-ADV-F9930 financial guard stays untouched-but-tracked");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender A: reintroduce the dashboard/kpis fake-empty catch.
  const offenderA = src.replace(
    "            LIMIT 1\n          `,\n          [companyId]\n        );\n      return res.rows[0] ?? null;",
    "            LIMIT 1\n          `,\n          [companyId]\n        )\n        .catch(() => ({ rows: [] }));\n      return res.rows[0] ?? null;"
  );
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender A (dashboard/kpis catch reintroduced) was NOT caught");
    process.exit(1);
  }

  // Offender B: someone "fixes" the financial reverse-guard catch too (out of scope for this sweep) —
  // the guard must notice its expected shape vanished, so the board-routed finding doesn't go stale.
  const offenderB = src.replace(
    ".catch(() => ({ rows: [{ cnt: 0 }] as Record<string, unknown>[] }));",
    ";"
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender B (financial guard catch removed, tripwire) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): both planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
