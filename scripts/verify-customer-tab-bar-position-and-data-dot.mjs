#!/usr/bin/env node
// B6 (owner, 2026-09-12) — "tab bar moved under customer name (a position fix, not a restyle)" +
// "a dot on any tab that contains data" (named the highest-value item in this box).
//
// Two source-text checks on apps/frontend/src/pages/CustomerDetail.tsx:
//   1) POSITION — <NavyPageSubNav appears BEFORE <CustomerRelationshipScore and
//      <CustomerFinancialOverviewSection in source order (both of which used to render above it).
//      A future edit that moves the tab bar back below them regresses the exact defect this fixed.
//   2) DATA DOT — the NavyPageSubNav items= prop actually computes a hasData field (not just
//      passing the shared component's default), so at least one real tab can show the dot.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-tab-bar-position-and-data-dot";
const FILE = "apps/frontend/src/pages/CustomerDetail.tsx";

export function auditAll(src) {
  const failures = [];

  const navIdx = src.indexOf("<NavyPageSubNav");
  const scoreIdx = src.indexOf("<CustomerRelationshipScore");
  const financialIdx = src.indexOf("<CustomerFinancialOverviewSection");
  if (navIdx === -1) {
    failures.push(`${FILE}: <NavyPageSubNav not found at all`);
  } else {
    if (scoreIdx !== -1 && navIdx > scoreIdx) {
      failures.push(`${FILE}: <NavyPageSubNav renders AFTER <CustomerRelationshipScore — regressed the "tab bar under customer name" position fix`);
    }
    if (financialIdx !== -1 && navIdx > financialIdx) {
      failures.push(`${FILE}: <NavyPageSubNav renders AFTER <CustomerFinancialOverviewSection — regressed the "tab bar under customer name" position fix`);
    }
  }

  if (!/hasData:\s*tabHasData\[/.test(src)) {
    failures.push(`${FILE}: NavyPageSubNav's items= no longer computes a real hasData value from tabHasData — the data-dot feature has been silently dropped`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const failures = auditAll(src);
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} OK — tab bar renders above the relationship-score/financial-overview blocks; data-dot wiring present.`);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  assert.equal(auditAll(real).length, 0, "real source should already pass both checks");

  // MUTATION 1 — simulate the tab bar rendering back below the score/overview blocks.
  const navBlockRe = /(\{\/\* B6 \(owner, 2026-09-12\)[\s\S]*?<NavyPageSubNav[\s\S]*?\/>\n)/;
  const navBlockMatch = real.match(navBlockRe);
  assert.ok(navBlockMatch, "selftest setup bug: could not isolate the NavyPageSubNav JSX block — update this mutation to match current source");
  const withoutNav = real.replace(navBlockRe, "");
  const financialAnchor = "<CustomerFinancialOverviewSection summary={financialSummaryQuery.data} loading={financialSummaryQuery.isLoading} error={financialSummaryQuery.isError} onRetry={() => void financialSummaryQuery.refetch()} />\n";
  assert.ok(withoutNav.includes(financialAnchor), "selftest setup bug: financial overview anchor not found");
  const mutated1 = withoutNav.replace(financialAnchor, financialAnchor + navBlockMatch[1]);
  const failures1 = auditAll(mutated1);
  assert.ok(
    failures1.some((f) => f.includes("AFTER <CustomerRelationshipScore") || f.includes("AFTER <CustomerFinancialOverviewSection")),
    "MUTATION 1 (tab bar moved back below the score/overview blocks) escaped detection"
  );

  // MUTATION 2 — strip the hasData wiring.
  const mutated2 = real.replace(/hasData:\s*tabHasData\[tab\]\s*===\s*true/, "hasData: false");
  assert.notEqual(mutated2, real, "selftest setup bug: hasData wiring text not found — update this mutation to match current source");
  const failures2 = auditAll(mutated2);
  assert.ok(
    failures2.some((f) => f.includes("data-dot feature has been silently dropped")),
    "MUTATION 2 (hasData wiring stripped) escaped detection"
  );

  console.log(`${LABEL} --selftest PASS (2/2 mutations caught)`);
  process.exit(0);
}

run();
