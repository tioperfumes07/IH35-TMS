#!/usr/bin/env node
/**
 * WAVE-C-gl_je-form425c — form_425 module "GL / JE" column, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: home, tab.form, tab.history, redirect.form425c, law.virtual_banks_excluded.
 *
 * All five already real, never tagged @matrix-built. form-425c.routes.ts computes
 * line_19_opening_cash by directly querying `FROM banking.bank_transactions bt JOIN
 * banking.bank_accounts a` filtered `account_type NOT LIKE 'virtual_%'` — the exact real
 * implementation of the "factoring/escrow excluded from main bank totals" law (lines 19-23).
 * Form425CHome.tsx (home / tab.form, reached via the redirect.form425c alias) wires this real
 * value; tab.history filters the SAME reportsQuery data for status='filed' — same real source,
 * not a separate fabricated dataset.
 *
 * tab.qb (QBImportTab.tsx) is NOT tagged — it is an explicitly session-scoped, client-side
 * paste-and-parse preview tool with no accounting or banking schema read/write; its own
 * footnote says "Authoritative Form lines 19-23 remain backend Banking import values." tab.profile,
 * tab.merge, exhibits, hop.safety_audit are also NOT tagged — real remaining gap/config-only
 * surfaces, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["form_425"],"cols":["gl_je"],"leafRe":"^(home|tab\\.form|tab\\.history|redirect\\.form425c|law\\.virtual_banks_excluded)$","task":"WAVE-C-gl_je-form425c","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-form425c.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-form425c";

const CHECKS = [
  {
    name: "form-425c.routes.ts computes line_19_opening_cash from real banking.bank_transactions",
    file: "apps/backend/src/compliance/form-425c.routes.ts",
    pattern: /FROM banking\.bank_transactions bt/,
  },
  {
    name: "form-425c.routes.ts excludes virtual accounts (the law)",
    file: "apps/backend/src/compliance/form-425c.routes.ts",
    pattern: /NOT LIKE 'virtual_%'/,
  },
  {
    name: "Form425CHome.tsx wires the real line_19_opening_cash field",
    file: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
    pattern: /line_19_opening_cash/,
  },
  {
    name: "Form425CHome.tsx history filters the same real reportsQuery data",
    file: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
    pattern: /historyReports = .*reportsQuery\.data\?\.reports/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/backend/src/compliance/form-425c.routes.ts":
      "FROM banking.bank_transactions bt JOIN banking.bank_accounts a ON ... NOT LIKE 'virtual_%'",
    "apps/frontend/src/pages/form425c/Form425CHome.tsx":
      "report.line_19_opening_cash ... const historyReports = (reportsQuery.data?.reports ?? []).filter(...)",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — form_425 home/tab.form/tab.history/redirect/law.virtual_banks_excluded gl_je wiring present`);
