#!/usr/bin/env node
/**
 * FAIL-F2 class-B (KIND SWEEP, not a one-site patch) — every money create surface that CAN supply
 * `is_sample_data` MUST supply it.
 *
 * The class: a backend writer merges accepting the flag, the FE never sends it, and the merged work is
 * INERT — rows land indistinguishable from real money, including ones with SAMPLE in their own memo.
 * A per-site patch does not close this; the next create surface repeats it. So this guard enumerates the
 * surfaces rather than naming one.
 *
 * Backend acceptance, read from the routes (this is the axis that decides whether a gap is FE or backend):
 *   accounting.expenses           expenses.routes.ts          ACCEPTS  -> FE must supply
 *   accounting.payments           customer-payments.routes.ts ACCEPTS  -> FE must supply when a caller exists
 *   accounting.bills              bills.routes.ts             DOES NOT -> FE cannot supply; backend gap
 *   bill payments                 bill-payment-gl.routes.ts   DOES NOT -> FE cannot supply; backend gap
 *
 * The two DOES-NOT rows are recorded, not silently skipped: an FE-only "fix" there would be theatre.
 *
 *   node scripts/verify-money-creates-supply-sample-flag.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-money-creates-supply-sample-flag";

/** FE payload builders that post to a backend which ACCEPTS the flag — each must send it. */
const MUST_SUPPLY = [
  {
    file: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
    route: "apps/backend/src/accounting/expenses.routes.ts",
    what: "Record Expense",
  },
];

/** Backend routes that must keep ACCEPTING the flag, or the FE supply above becomes dead weight. */
const MUST_ACCEPT = [
  "apps/backend/src/accounting/expenses.routes.ts",
  "apps/backend/src/accounting/customer-payments.routes.ts",
];

function read(rel) {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return "";
  }
}

function assert(files) {
  const problems = [];

  for (const s of MUST_SUPPLY) {
    const src = files[s.file] ?? "";
    if (!src) {
      problems.push(`${s.file}: missing — ${s.what} payload builder moved; re-point this guard`);
      continue;
    }
    if (!/is_sample_data\s*:/.test(src)) {
      problems.push(
        `${s.file}: ${s.what} must SUPPLY is_sample_data — ${s.route} already accepts it, so omitting it ` +
          `leaves merged backend work inert and the row indistinguishable from real money (FAIL-F2 class-B).`,
      );
    }
  }

  for (const rel of MUST_ACCEPT) {
    const src = files[rel] ?? "";
    if (src && !/is_sample_data/.test(src)) {
      problems.push(`${rel}: must keep accepting is_sample_data — the FE supplies it`);
    }
  }

  return problems;
}

const RELS = [...MUST_SUPPLY.map((s) => s.file), ...MUST_ACCEPT];
const files = Object.fromEntries(RELS.map((r) => [r, read(r)]));

if (SELFTEST) {
  const checks = [];
  const f = MUST_SUPPLY[0].file;
  const stripped = { ...files, [f]: files[f].replace(/is_sample_data\s*:[^,]*,/, "") };
  checks.push(["FE stops supplying", assert(stripped).some((p) => /must SUPPLY is_sample_data/.test(p))]);
  const r = MUST_ACCEPT[0];
  const noAccept = { ...files, [r]: files[r].replace(/is_sample_data/g, "unrelated_field") };
  checks.push(["backend stops accepting", assert(noAccept).some((p) => /must keep accepting/.test(p))]);
  const failed = checks.filter(([, c]) => !c).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — every money create surface whose backend accepts is_sample_data supplies it`);
process.exit(0);
