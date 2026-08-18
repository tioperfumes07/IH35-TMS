#!/usr/bin/env node
/**
 * verify-money-detail-page-uses-ispending — LV-JE-DETAIL-COLD-NAV-FALSE-NOT-FOUND class guard.
 *
 * react-query v5 defines isLoading = isPending && isFetching (query-core queryObserver.js). Any
 * accounting detail page whose primary record query is `enabled: Boolean(...selectedCompanyId...)`
 * and which renders a terminal "<Thing> not found." leaf when data is missing MUST gate that leaf on
 * isPending, not isLoading — otherwise a cold direct navigation (bookmark, shared link, EntityLink
 * opened in a new tab) races ahead of CompanyContext's async company-list fetch. The query stays
 * disabled, isLoading reports false (isPending is true but isFetching is false), and the render falls
 * straight through the loading/error guards into "not found" for a REAL, EXISTING record.
 *
 * Live-reproduced 2026-08-18 on JournalEntryDetailPage.tsx: JE 0e3bdf59-b242-4dd8-8e43-218687184954
 * (a real posted journal entry, confirmed on Neon) showed "Journal entry not found." on a direct
 * hard-navigation, then loaded correctly on reload once CompanyContext had already resolved. Fixed
 * across all 7 money detail pages that share this exact shape (Bill, BillPayment, Expense, Payment,
 * FactoringAdvance, Invoice, JournalEntry). This guard makes sure a new detail page — or a regression
 * on one of these seven — can't reintroduce the false "not found" silently.
 *
 * Scope: apps/frontend/src/pages/accounting/**\/*.tsx (recursive) — the money lane.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SCOPE_DIR = path.join(ROOT, "apps/frontend/src/pages/accounting");

function listTsxFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsxFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Returns the variable names of useQuery() calls whose `enabled` clause references selectedCompanyId. */
function findCompanyScopedQueryVars(src) {
  const markers = [...src.matchAll(/const (\w+) = useQuery\(\{/g)];
  const vars = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : src.length;
    const chunk = src.slice(start, end);
    const enabledMatch = chunk.match(/enabled:\s*Boolean\(([^)]*)\)/);
    if (enabledMatch && /selectedCompanyId/.test(enabledMatch[1])) {
      vars.push(markers[i][1]);
    }
  }
  return vars;
}

const failures = [];
const files = fs.existsSync(SCOPE_DIR) ? listTsxFiles(SCOPE_DIR) : [];

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!/not found\./i.test(src)) continue; // not a detail page with a terminal not-found leaf
  const rel = path.relative(ROOT, file);
  const vars = findCompanyScopedQueryVars(src);

  // Only the query var(s) actually used as a terminal loading gate (an `if (v.isLoading)` or
  // `if (v.isPending)` early return/block) are in scope — a file can legitimately hold other
  // company-scoped auxiliary queries (source lineage, income accounts, open invoices, ...) that never
  // gate the "not found" leaf at all, and those must not be flagged.
  for (const v of vars) {
    const regression = new RegExp(`\\b${v}\\.isLoading\\)\\s*(return|\\{)`);
    const guarded = new RegExp(`\\b${v}\\.isPending\\)\\s*(return|\\{)`);
    if (regression.test(src)) {
      failures.push(
        `${rel}: query "${v}" is company-scoped (enabled: Boolean(...selectedCompanyId...)) and this ` +
          `file renders a "not found." leaf, but its terminal guard uses .isLoading — cold-nav false-` +
          `not-found risk (LV-JE-DETAIL-COLD-NAV-FALSE-NOT-FOUND). Use .isPending instead.`,
      );
    }
    // else: var was never used as a terminal isLoading/isPending gate at all — not in scope, skip.
  }
}

if (failures.length > 0) {
  console.error(`verify-money-detail-page-uses-ispending: FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(
  "verify-money-detail-page-uses-ispending: PASS — all company-scoped accounting detail pages gate their not-found leaf on isPending, not isLoading.",
);
process.exit(0);
