#!/usr/bin/env node
/**
 * WAVE-C-liability-insurance-legal — insurance + legal modules "Liability / Reserve" column,
 * VERTICAL-WIRING-LAW-2026-08-12.
 *
 * All already real, never tagged @matrix-built:
 *   - insurance policies.create: PoliciesList.tsx renders real total_premium_cents /
 *     PolicyDetail.tsx renders insured_value_cents (real stored money exposure).
 *   - insurance claims.create: ClaimsTab.tsx renders real amount_claimed_cents /
 *     amount_paid_cents (liability) AND real EntityLink kind="bill" / kind="expense" rows
 *     (gl_je, transitively real via accounting.bills/expenses journal_entry_id, already
 *     verified in WAVE-C-gl_je-accounting-core-leaves).
 *   - insurance lawsuits.create: LawsuitsTab.tsx renders real demand_cents / settlement_cents.
 *   - legal matters.create / matters.detail: LegalMatterFormFields.tsx (the create form) and
 *     LegalMatterDetailPage.tsx both carry a real financial_reserve_cents field — an explicit
 *     legal-matter reserve/liability figure, not a fabricated placeholder.
 *
 * legal's "reports" leaf and legal matters.create's gl_je requirement are NOT tagged here —
 * LegalReportsLandingPage.tsx is a navigational landing page with no aggregate figure of its
 * own, and no journal_entry/bill/expense EntityLink was found on the legal matters surfaces.
 * Real remaining gaps, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["insurance"],"cols":["liability"],"leafRe":"^(policies\\.create|claims\\.create|lawsuits\\.create)$","task":"WAVE-C-liability-insurance","vertical":"column-wave"}
 * @matrix-built {"modules":["insurance"],"cols":["gl_je"],"leafRe":"^claims\\.create$","task":"WAVE-C-gl_je-insurance-claims","vertical":"column-wave"}
 * @matrix-built {"modules":["legal"],"cols":["liability"],"leafRe":"^(matters\\.create|matters\\.detail)$","task":"WAVE-C-liability-legal-matters","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-liability-insurance-legal.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-liability-insurance-legal";

const CHECKS = [
  {
    name: "insurance policies.create: PoliciesList.tsx renders real total_premium_cents",
    file: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
    pattern: /total_premium_cents/,
  },
  {
    name: "insurance claims.create: ClaimsTab.tsx renders real amount_claimed_cents",
    file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    pattern: /amount_claimed_cents/,
  },
  {
    name: "insurance claims.create: ClaimsTab.tsx renders real bill/expense EntityLink (gl_je)",
    file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
    pattern: /kind="bill"[\s\S]*kind="expense"/,
  },
  {
    name: "insurance lawsuits.create: LawsuitsTab.tsx renders real demand_cents/settlement_cents",
    file: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
    pattern: /demand_cents[\s\S]*settlement_cents/,
  },
  {
    name: "legal matters.create: LegalMatterFormFields.tsx carries financial_reserve field",
    file: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
    pattern: /financial_reserve/,
  },
  {
    name: "legal matters.detail: LegalMatterDetailPage.tsx renders financial_reserve_cents",
    file: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
    pattern: /financial_reserve_cents/,
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
    "apps/frontend/src/pages/insurance/PoliciesList.tsx": "p.total_premium_cents",
    "apps/frontend/src/pages/insurance/ClaimsTab.tsx":
      'claim.amount_claimed_cents ... kind="bill" ... kind="expense"',
    "apps/frontend/src/pages/insurance/LawsuitsTab.tsx": "lawsuit.demand_cents ... lawsuit.settlement_cents",
    "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx": "financial_reserve_cents",
    "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx": "matter.financial_reserve_cents",
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
console.log(`[${LABEL}] PASS — insurance policies/claims/lawsuits + legal matters liability wiring present`);
