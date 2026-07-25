#!/usr/bin/env node
/**
 * ACCT-08 / ACCT-SURF-01…09 — structural DoD-A / VERIFY-3/7 half.
 * Asserts each SURF surface route is mounted to a real page (not ComingSoon twin),
 * and key creators/pickers stay on canonical paths.
 *
 * Live Expected vs Actual click-through rows live on Desktop:
 *   ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 *   node scripts/verify-acct-surfaces-structural.mjs
 *   node scripts/verify-acct-surfaces-structural.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surfaces-structural";

const SURFACES = [
  { id: "ACCT-SURF-01", path: "/accounting/bills", component: "BillsPage" },
  { id: "ACCT-SURF-02", path: "/accounting/expenses", component: "ExpensesListPage" },
  { id: "ACCT-SURF-03", path: "/accounting/bill-payments", component: "BillPaymentsListPage" },
  { id: "ACCT-SURF-04", path: "/accounting/payments", component: "PaymentsListPage" },
  { id: "ACCT-SURF-05", path: "/accounting/journal-entries", component: "ManualJEListPage" },
  { id: "ACCT-SURF-06", path: "/lists/accounting/chart-of-accounts", component: "ChartOfAccountsListPage" },
  { id: "ACCT-SURF-07", path: "/accounting/account-register", component: "AccountRegisterPage" },
  { id: "ACCT-SURF-08", path: "/accounting/period-close", component: null, navigateTo: "/accounting/month-close" },
  { id: "ACCT-SURF-09", path: "/accounting/factoring", component: "FactoringListPage" },
];

const EXTRA = [
  { id: "ACCT-SURF-07b", path: "/accounting/transactions", component: "TransactionRegisterPage" },
  { id: "ACCT-SURF-08b", path: "/accounting/audit-trail", component: "AccountingAuditTrailPage" },
  { id: "ACCT-SURF-08c", path: "/accounting/posting-lineage", component: "PostingLineagePage" },
  { id: "ACCT-SURF-09b", path: "/accounting/escrow", component: "EscrowPage" },
  { id: "ACCT-SURF-06b", path: "/lists/accounting/detail-types", component: null, allowAny: true },
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,500}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(manifest, subnav) {
  const errors = [];
  for (const s of [...SURFACES, ...EXTRA]) {
    const block = routeBlock(manifest, s.path);
    if (!block) {
      errors.push(`${s.id}: missing route ${s.path}`);
      continue;
    }
    if (/ComingSoonPage/.test(block)) {
      errors.push(`${s.id}: ${s.path} must not mount ComingSoonPage twin`);
    }
    if (s.navigateTo) {
      if (!block.includes(`to="${s.navigateTo}"`) && !block.includes(`to={'${s.navigateTo}'}`)) {
        // Navigate element
        if (!block.includes(s.navigateTo)) {
          errors.push(`${s.id}: ${s.path} should Navigate to ${s.navigateTo}`);
        }
      }
    } else if (s.component && !block.includes(`<${s.component}`)) {
      errors.push(`${s.id}: ${s.path} must render <${s.component} />`);
    }
    if (!s.allowAny && !subnav.includes(s.path) && s.path.startsWith("/accounting/")) {
      // detail-types / lists may still be in SUBNAV_ITEMS
      if (!subnav.includes(s.path)) {
        errors.push(`${s.id}: ${s.path} missing from subnav-manifest SUBNAV_ITEMS`);
      }
    }
  }

  // SURF-06 detail-types leaf must remain reachable (NEVER-DELETE)
  if (!subnav.includes("/lists/accounting/detail-types")) {
    errors.push("ACCT-SURF-06: detail-types path must stay in SUBNAV_ITEMS");
  }
  if (!subnav.includes("/lists/accounting/chart-of-accounts")) {
    errors.push("ACCT-SURF-06: chart-of-accounts path must stay in SUBNAV_ITEMS");
  }

  return errors;
}

function selftest(manifest, subnav) {
  const good = contractErrors(manifest, subnav);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good:`, good.slice(0, 5));
    process.exit(1);
  }
  const badManifest = manifest.replace(
    'path="/accounting/bills"',
    'path="/accounting/bills-hidden"'
  );
  if (contractErrors(badManifest, subnav).length === 0) {
    console.error(`${LABEL} --selftest FAIL inert bills route drop`);
    process.exit(1);
  }
  const twin = manifest.replace(
    /path="\/accounting\/expenses"[\s\S]{0,200}?ExpensesListPage/,
    'path="/accounting/expenses" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>}'
  );
  if (!contractErrors(twin, subnav).some((e) => e.includes("ComingSoon"))) {
    // fallback: inject ComingSoon into expenses block
    const injected = manifest.replace(
      'path="/accounting/expenses"',
      'path="/accounting/expenses" data-x="ComingSoonPage"'
    );
    // force a synthetic block check
    const synth = injected.replace(
      /path="\/accounting\/expenses"[\s\S]{0,400}/,
      'path="/accounting/expenses"\n<ComingSoonPage />\n'
    );
    if (!contractErrors(synth, subnav).some((e) => e.includes("ComingSoon") || e.includes("ExpensesListPage"))) {
      console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL}: selftest PASS`);
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");

if (process.argv.includes("--selftest")) {
  selftest(manifest, subnav);
  process.exit(0);
}

const errors = contractErrors(manifest, subnav);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — SURF-01…09 structural routes mounted, no ComingSoon twins on money leaves`);
process.exit(0);
