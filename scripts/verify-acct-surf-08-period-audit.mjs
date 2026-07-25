#!/usr/bin/env node
/**
 * ACCT-SURF-08 — Period close / Audit trail / Posting lineage deep structural DoD.
 *
 * Frozen surface map: docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md
 *
 * Asserts:
 *  - DOD-A: /accounting/period-close → Navigate to month-close; MonthClosePage real (not ComingSoon)
 *  - DOD-A: /accounting/audit-trail → AccountingAuditTrailPage; /accounting/posting-lineage → PostingLineagePage
 *  - VERIFY-7 / NEVER-DELETE: More ▾ leaves month-close, period-close, audit-trail, posting-lineage in subnav
 *  - DOD-B / VERIFY-3: month-close API (status + lock + acknowledge); audit-trail + source-lineage GET
 *  - VERIFY-3 server: listAccountingAuditTrail reads accounting.journal_entry_postings; lockMonthClose UPDATEs accounting.periods
 *  - VERIFY-4: EntityLink drill on audit-trail + posting-lineage pages
 *
 * Does NOT flip scoreboard PASS — live browser TRANSP+USMCA + Neon period-close evidence remain UNVERIFIED.
 *
 *   node scripts/verify-acct-surf-08-period-audit.mjs
 *   node scripts/verify-acct-surf-08-period-audit.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-surf-08-period-audit";

const FILES = {
  map: "docs/trackers/ACCT-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  monthClose: "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
  auditTrail: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
  postingLineage: "apps/frontend/src/pages/accounting/PostingLineagePage.tsx",
  api: "apps/frontend/src/api/accounting.ts",
  monthCloseRoutes: "apps/backend/src/accounting/month-close.routes.ts",
  monthCloseService: "apps/backend/src/accounting/month-close.service.ts",
  auditTrailRoutes: "apps/backend/src/accounting/audit-trail/routes.ts",
  auditTrailService: "apps/backend/src/accounting/audit-trail/service.ts",
};

const SURF_LEAVES = [
  "/accounting/month-close",
  "/accounting/period-close",
  "/accounting/audit-trail",
  "/accounting/posting-lineage",
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

function contractErrors(src) {
  const errors = [];
  if (!src.map.includes("ACCT-SURF-08") || !src.map.includes("/accounting/period-close")) {
    errors.push("frozen map missing ACCT-SURF-08 → period-close / audit-trail / posting-lineage");
  }

  const periodCloseBlock = routeBlock(src.manifest, "/accounting/period-close");
  if (!periodCloseBlock) {
    errors.push("DOD-A: missing route /accounting/period-close");
  } else if (/ComingSoonPage/.test(periodCloseBlock)) {
    errors.push("DOD-A: /accounting/period-close must not mount ComingSoonPage");
  } else if (!/<Navigate[^>]+to=["']\/accounting\/month-close["']/.test(periodCloseBlock)) {
    errors.push("DOD-A: /accounting/period-close must Navigate to /accounting/month-close (NEVER-DELETE alias)");
  }

  const monthCloseBlock = routeBlock(src.manifest, "/accounting/month-close");
  if (!monthCloseBlock) errors.push("DOD-A: missing route /accounting/month-close");
  else {
    if (/ComingSoonPage/.test(monthCloseBlock)) {
      errors.push("DOD-A: /accounting/month-close must not mount ComingSoonPage");
    }
    if (!monthCloseBlock.includes("<MonthClosePage")) {
      errors.push("DOD-A: /accounting/month-close must render <MonthClosePage />");
    }
  }

  const auditBlock = routeBlock(src.manifest, "/accounting/audit-trail");
  if (!auditBlock) errors.push("DOD-A: missing route /accounting/audit-trail");
  else {
    if (/ComingSoonPage/.test(auditBlock)) {
      errors.push("DOD-A: /accounting/audit-trail must not mount ComingSoonPage");
    }
    if (!auditBlock.includes("<AccountingAuditTrailPage")) {
      errors.push("DOD-A: /accounting/audit-trail must render <AccountingAuditTrailPage />");
    }
  }

  const lineageBlock = routeBlock(src.manifest, "/accounting/posting-lineage");
  if (!lineageBlock) errors.push("DOD-A: missing route /accounting/posting-lineage");
  else {
    if (/ComingSoonPage/.test(lineageBlock)) {
      errors.push("DOD-A: /accounting/posting-lineage must not mount ComingSoonPage");
    }
    if (!lineageBlock.includes("<PostingLineagePage")) {
      errors.push("DOD-A: /accounting/posting-lineage must render <PostingLineagePage />");
    }
  }

  for (const leaf of SURF_LEAVES) {
    if (!src.subnav.includes(leaf)) {
      errors.push(`VERIFY-7 / NEVER-DELETE: SURF-08 leaf ${leaf} missing from subnav-manifest`);
    }
  }

  for (const needle of ["getMonthCloseStatus", "closeMonth", "acknowledgeMonthCloseChecklist", "AccountingSubNavWrapper", "ParityTable"]) {
    if (!src.monthClose.includes(needle)) {
      errors.push(`DOD-B: MonthClosePage must wire ${needle}`);
    }
  }

  for (const needle of ["listAccountingAuditTrail", "getAccountingSourceLineage", "EntityLink", "AccountingSubNavWrapper", "ParityTable"]) {
    if (!src.auditTrail.includes(needle)) {
      errors.push(`VERIFY-4: AccountingAuditTrailPage must wire ${needle}`);
    }
  }

  for (const needle of ["getAccountingSourceLineage", "EntityLink", "AccountingSubNavWrapper", "ParityTable"]) {
    if (!src.postingLineage.includes(needle)) {
      errors.push(`VERIFY-4: PostingLineagePage must wire ${needle}`);
    }
  }

  if (!src.api.includes("function getMonthCloseStatus") || !src.api.includes("/api/v1/accounting/month-close-status")) {
    errors.push("VERIFY-3: getMonthCloseStatus must GET /api/v1/accounting/month-close-status");
  }
  if (!src.api.includes("function closeMonth") || !src.api.includes('"/api/v1/accounting/month-close"')) {
    errors.push("VERIFY-3: closeMonth must POST /api/v1/accounting/month-close");
  } else {
    const fnIdx = src.api.indexOf("function closeMonth");
    const slice = src.api.slice(fnIdx, fnIdx + 1200);
    if (!slice.includes('method: "POST"')) {
      errors.push("VERIFY-3: closeMonth body must use POST");
    }
  }
  if (!src.api.includes("function listAccountingAuditTrail") || !src.api.includes("/api/v1/accounting/audit-trail?")) {
    errors.push("VERIFY-3: listAccountingAuditTrail must GET /api/v1/accounting/audit-trail");
  }
  if (!src.api.includes("function getAccountingSourceLineage") || !src.api.includes("/api/v1/accounting/audit-trail/source-lineage")) {
    errors.push("VERIFY-3: getAccountingSourceLineage must GET /api/v1/accounting/audit-trail/source-lineage");
  }

  if (!src.monthCloseRoutes.includes('app.get("/api/v1/accounting/month-close-status"')) {
    errors.push("VERIFY-3: month-close-status route must be mounted");
  }
  if (!src.monthCloseRoutes.includes('app.post("/api/v1/accounting/month-close"')) {
    errors.push("VERIFY-3: month-close lock route must be mounted");
  }
  if (!src.auditTrailRoutes.includes('app.get("/api/v1/accounting/audit-trail"')) {
    errors.push("VERIFY-3: accounting audit-trail route must be mounted");
  }
  if (!src.auditTrailRoutes.includes('app.get("/api/v1/accounting/audit-trail/source-lineage"')) {
    errors.push("VERIFY-3: accounting source-lineage route must be mounted");
  }

  if (!src.auditTrailService.includes("FROM accounting.journal_entry_postings")) {
    errors.push("VERIFY-3: audit-trail service must read accounting.journal_entry_postings (canonical)");
  }
  if (!src.monthCloseService.includes("UPDATE accounting.periods")) {
    errors.push("VERIFY-3: lockMonthClose must UPDATE accounting.periods");
  }
  if (/INSERT INTO\s+bank\.|INSERT INTO\s+payroll\.|INSERT INTO\s+mdata\.qbo_/i.test(src.auditTrailService)) {
    errors.push("VERIFY-3: audit-trail service must not write RETIRE schemas");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "ACCT-SURF-08 `/accounting/period-close` audit-trail posting-lineage",
    manifest: [
      'path="/accounting/period-close"',
      '<Navigate to="/accounting/month-close" replace />',
      'path="/accounting/month-close"',
      "<MonthClosePage />",
      'path="/accounting/audit-trail"',
      "<AccountingAuditTrailPage />",
      'path="/accounting/posting-lineage"',
      "<PostingLineagePage />",
    ].join("\n"),
    subnav: SURF_LEAVES.join("\n"),
    monthClose: "getMonthCloseStatus closeMonth acknowledgeMonthCloseChecklist AccountingSubNavWrapper ParityTable",
    auditTrail: "listAccountingAuditTrail getAccountingSourceLineage EntityLink AccountingSubNavWrapper ParityTable",
    postingLineage: "getAccountingSourceLineage EntityLink AccountingSubNavWrapper ParityTable",
    api: [
      "function getMonthCloseStatus",
      "/api/v1/accounting/month-close-status",
      "function closeMonth",
      '"/api/v1/accounting/month-close"',
      'method: "POST"',
      "function listAccountingAuditTrail",
      "/api/v1/accounting/audit-trail?",
      "function getAccountingSourceLineage",
      "/api/v1/accounting/audit-trail/source-lineage",
    ].join("\n"),
    monthCloseRoutes: 'app.get("/api/v1/accounting/month-close-status" app.post("/api/v1/accounting/month-close"',
    monthCloseService: "UPDATE accounting.periods",
    auditTrailRoutes: 'app.get("/api/v1/accounting/audit-trail" app.get("/api/v1/accounting/audit-trail/source-lineage"',
    auditTrailService: "FROM accounting.journal_entry_postings",
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = {
    ...good,
    manifest: 'path="/accounting/month-close"\n<ComingSoonPage />\n',
  };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const missingAlias = {
    ...good,
    manifest: good.manifest.replace('<Navigate to="/accounting/month-close" replace />', "<div />"),
  };
  if (!contractErrors(missingAlias).some((e) => e.includes("Navigate"))) {
    console.error(`${LABEL} --selftest FAIL period-close alias not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ACCT-SURF-08 Period/Audit/Lineage structural DoD (routes+subnav+API+canonical postings); live browser still UNVERIFIED`
);
process.exit(0);
