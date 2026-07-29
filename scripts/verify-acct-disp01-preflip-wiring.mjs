#!/usr/bin/env node
/**
 * DISP-01 — durable pre-flip wiring (flag stays OFF):
 *  1) revenue-recognition detail isEnabled passes operating_company_id (0243-h3-2)
 *  2) poster gates on REVENUE_RECOGNITION_POST_ENABLED with opco context
 *  3) dispatch load status hooks earn/bill via postLoadRevenueLatch
 *  4) RLS-safe unbilled_revenue role-bind migration present (ih35_app + opco GUC)
 *  5) flag enrolled in POSTING_FLAG_KEYS
 *
 * Does NOT require flag ON or latch density — those remain UNVERIFIED until owner enable + smoke.
 * Cursor even claim: verify-step 1766.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

const routes = read("apps/backend/src/accounting/revenue-recognition.routes.ts");
const poster = read("apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts");
const loads = read("apps/backend/src/dispatch/loads.routes.ts");
const flags = read("apps/backend/src/lib/feature-flags/service.ts");
const mig = read("db/migrations/202610201200_disp_01_unbilled_role_bind_rls_safe.sql");
const fa = read("apps/backend/src/accounting/fixed-assets.routes.ts");

if (!/isEnabled\(\s*client,\s*POST_FLAG,\s*\{[\s\S]*?operating_company_id:\s*qp\.data\.operating_company_id/.test(routes)) {
  failures.push(
    "revenue-recognition.routes.ts must call isEnabled(client, POST_FLAG, { operating_company_id: qp.data.operating_company_id, ... })"
  );
}
// Strip line comments before probing for bare two-arg calls (comment text may quote the anti-pattern).
const routesNoLineComments = routes.replace(/\/\/[^\n]*/g, "");
if (/isEnabled\(\s*client,\s*POST_FLAG\s*\)/.test(routesNoLineComments)) {
  failures.push("revenue-recognition.routes.ts still has bare isEnabled(client, POST_FLAG) without opco context");
}

if (!/REVENUE_RECOGNITION_POST_ENABLED/.test(poster) || !/operating_company_id:\s*operatingCompanyId/.test(poster)) {
  failures.push("poster must gate REVENUE_RECOGNITION_POST_ENABLED with operating_company_id context");
}
if (!/buildEarnEvent1Postings/.test(poster) || !/buildBillEvent2Postings/.test(poster)) {
  failures.push("poster missing earn/bill builders");
}
if (!/unbilled_revenue/.test(poster)) {
  failures.push("poster must resolveRoleAccount unbilled_revenue");
}

if (!/postLoadRevenueLatch/.test(loads)) {
  failures.push("loads.routes.ts must call postLoadRevenueLatch");
}
if (!/delivered_pending_docs/.test(loads) || !/completed_docs_received/.test(loads)) {
  failures.push("loads.routes.ts must hook both delivered_pending_docs and completed_docs_received");
}

if (!/POSTING_FLAG_KEYS/.test(flags) || !/REVENUE_RECOGNITION_POST_ENABLED/.test(flags)) {
  failures.push("REVENUE_RECOGNITION_POST_ENABLED must be enrolled in POSTING_FLAG_KEYS");
}

if (!/SET LOCAL ROLE ih35_app/.test(mig)) {
  failures.push("migration must SET LOCAL ROLE ih35_app for FORCE RLS binds");
}
if (!/RESET ROLE/.test(mig)) {
  failures.push("migration must RESET ROLE before DO ends (else CI ledger write permission denied)");
}
if (!/app\.operating_company_id/.test(mig) || !/unbilled_revenue/.test(mig)) {
  failures.push("migration must set app.operating_company_id and bind unbilled_revenue");
}
if (/REVENUE_RECOGNITION_POST_ENABLED[\s\S]{0,200}enabled\s*=\s*true|enabled\s*=\s*true[\s\S]{0,200}REVENUE_RECOGNITION_POST_ENABLED/.test(mig)) {
  failures.push("migration must NOT enable REVENUE_RECOGNITION_POST_ENABLED (owner flips; bind-only)");
}

// Companion: fixed-assets detail must also pass opco (same 0243-h3-2 class)
const faNoLineComments = fa.replace(/\/\/[^\n]*/g, "");
if (/isEnabled\(\s*client,\s*AUTOPOST_FLAG\s*\)/.test(faNoLineComments)) {
  failures.push("fixed-assets.routes.ts still has bare isEnabled(client, AUTOPOST_FLAG) — pass operating_company_id");
}
if (!/isEnabled\(\s*client,\s*AUTOPOST_FLAG,\s*\{[\s\S]*?operating_company_id:\s*qp\.data\.operating_company_id/.test(fa)) {
  failures.push("fixed-assets.routes.ts must call isEnabled(client, AUTOPOST_FLAG, { operating_company_id, ... })");
}

if (failures.length) {
  console.error("verify-acct-disp01-preflip-wiring: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  "verify-acct-disp01-preflip-wiring: OK — opco-scoped flag reads + RLS-safe unbilled bind migration + dispatch hooks; flag stays OFF"
);
