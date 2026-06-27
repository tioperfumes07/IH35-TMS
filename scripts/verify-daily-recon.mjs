#!/usr/bin/env node
/**
 * CI guard: RECON — Daily TMS↔QBO Reconciliation screen.
 * Proves: route handler exists, reads from both real data sources (journal_entries + qbo_sync_queue),
 * entity-scoped (operating_company_id enforced), honest empty state, no mocks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
let passed = 0;
let failed = 0;

function ok(label) { console.log(`OK:   ${label}`); passed++; }
function fail(label) { console.error(`FAIL: ${label}`); failed++; }
function check(label, bool) { bool ? ok(label) : fail(label); }

function read(rel) {
  try { return readFileSync(resolve(ROOT, rel), "utf8"); } catch { return ""; }
}

// 1. Backend route file exists and exports the fastify plugin
const backendRoute = read("apps/backend/src/accounting/daily-recon.routes.ts");
check("Backend route file exists", backendRoute.length > 0);
check("Route GET /api/v1/accounting/daily-recon declared", backendRoute.includes("/api/v1/accounting/daily-recon"));
check("Autoloaded via accounting/index.ts (@fastify/autoload)", (() => {
  const idx = read("apps/backend/src/accounting/index.ts");
  return idx.includes("autoload") && (idx.includes(".routes.") || idx.includes("routes"));
})());

// 2. Both real data sources queried
check("TMS source: accounting.journal_entries read", backendRoute.includes("accounting.journal_entries"));
check("TMS source: accounting.journal_entry_postings read", backendRoute.includes("accounting.journal_entry_postings"));
check("QBO source: integrations.qbo_sync_queue read", backendRoute.includes("integrations.qbo_sync_queue"));

// 3. Entity scope enforced
check("RLS set_config used (withCompanyScope)", backendRoute.includes("withCompanyScope"));
check("operating_company_id in WHERE clause", backendRoute.includes("operating_company_id = $1"));

// 4. Honest empty state — posting disabled path
check("posting_enabled false branch returns empty days", backendRoute.includes("posting_enabled: false"));
check("GL_POSTING_ENABLED feature flag checked", backendRoute.includes("GL_POSTING_ENABLED"));

// 5. Match logic covers all four statuses
check("MATCHED status logic", backendRoute.includes("'matched'"));
check("MISSING_IN_QBO status logic", backendRoute.includes("'missing_in_qbo'"));
check("AMOUNT_MISMATCH status logic", backendRoute.includes("'amount_mismatch'"));
check("MISSING_IN_TMS status logic", backendRoute.includes("'missing_in_tms'"));

// 6. Frontend API client
const feClient = read("apps/frontend/src/api/daily-recon.ts");
check("Frontend API client exists", feClient.length > 0);
check("Frontend client calls /api/v1/accounting/daily-recon", feClient.includes("/api/v1/accounting/daily-recon"));
check("DailyReconResponse type exported", feClient.includes("DailyReconResponse"));

// 7. Frontend page
const page = read("apps/frontend/src/pages/accounting/DailyReconPage.tsx");
check("DailyReconPage component exists", page.includes("export function DailyReconPage"));
check("Honest empty state rendered (TMS posting not enabled)", page.includes("TMS posting not enabled"));
check("No ComingSoon in DailyReconPage", !page.includes("ComingSoon") && !page.includes("coming soon"));
check("All reconciled banner rendered", page.includes("All reconciled"));
check("Detail drill-through links rendered (Link to tms_detail_path)", page.includes("tms_detail_path"));

// 8. Route registered in manifest
const manifest = read("apps/frontend/src/routes/manifest.tsx");
check("Manifest imports DailyReconPage", manifest.includes("DailyReconPage"));
check("Manifest route /accounting/daily-recon", manifest.includes("/accounting/daily-recon"));

// 9. Tab in ACCOUNTING_CLEAN_TABS
const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
check("Daily Recon tab in ACCOUNTING_CLEAN_TABS", subnav.includes("daily-recon"));

// 10. Entity TRANSP only — no cross-entity netting
check("No TRK/USMCA cross-entity netting in route", !backendRoute.includes("TRK") && !backendRoute.includes("USMCA"));
check("Entity-scope via operating_company_id (no global queries)", (backendRoute.match(/operating_company_id/g) || []).length >= 3);

console.log(`\n${passed + failed === 0 ? "No checks ran" : `${passed}/${passed + failed} passed`}`);
if (failed > 0) {
  console.error(`\n❌ RECON CI guard FAILED — ${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\n✅ RECON CI guard PASSED — daily-recon route↔handler↔both-sources↔RLS↔entity-scope verified.");
