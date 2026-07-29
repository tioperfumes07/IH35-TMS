#!/usr/bin/env node
/**
 * ACCT-PR-16/22 — Posting Templates reachable from Accounting More ▾ subnav.
 *
 * Audit gap (2026-07-22): PostingTemplatesListPage was mounted at
 * /lists/accounting/posting-templates but absent from Accounting SUBNAV_ITEMS — reachable only via
 * Lists module or direct URL. Rule 07: add Accounting entry; keep Lists catalog tile.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LIVE_PATH = "/lists/accounting/posting-templates";
const failures = [];

function read(rel) {
  try {
    return readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    return "";
  }
}

const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
const subnavBlock =
  subnav.match(/export const SUBNAV_ITEMS[\s\S]*?\]\s*as const;/)?.[0] ?? "";

if (
  !/label: "Posting Templates", path: "\/lists\/accounting\/posting-templates", section: "more"/.test(
    subnavBlock
  )
) {
  failures.push(
    "subnav-manifest: More ▾ must expose Posting Templates → /lists/accounting/posting-templates"
  );
}

const moreChildren = subnav.match(/childrenOf\("more"\)/);
if (!moreChildren) {
  failures.push("subnav-manifest: ACCOUNTING_SUB_NAV_ITEMS must render More ▾ via childrenOf(\"more\")");
}

const map = read("apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx");
if (!/catalogKey: "posting-templates"/.test(map)) {
  failures.push("AllCatalogsMap must retain Lists posting-templates catalog entry (Rule 07 only-add)");
}

const manifest = read("apps/frontend/src/routes/manifest.tsx");
if (!new RegExp(`path="${LIVE_PATH}"`).test(manifest) || !/<PostingTemplatesListPage \/>/.test(manifest)) {
  failures.push(`manifest must route ${LIVE_PATH} → PostingTemplatesListPage`);
}

const page = read("apps/frontend/src/pages/lists/accounting/PostingTemplatesListPage.tsx");
// ACCT-LINK-05: custom list + PostingTemplateModal (debit/credit CoA) replaced the generic
// AccountingCatalogListPage displayName prop — still the live surface when title + modal + client match.
const liveSurface =
  (/title="Posting Templates"/.test(page) || /displayName="Posting Templates"/.test(page)) &&
  /PostingTemplateModal/.test(page) &&
  /postingTemplatesCatalogClient/.test(page);
if (!liveSurface) {
  failures.push(
    "PostingTemplatesListPage must remain the live posting-templates surface (title + PostingTemplateModal + postingTemplatesCatalogClient)"
  );
}

if (failures.length) {
  console.error("FAIL verify-acct-templates-subnav:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(
  "PASS verify-acct-templates-subnav — Accounting More ▾ links Posting Templates; Lists entry retained"
);
