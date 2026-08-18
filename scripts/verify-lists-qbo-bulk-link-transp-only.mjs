#!/usr/bin/env node
/**
 * LV-LISTS-USMCA-QBO-BULK-LINK — Lists "QBO bulk-link" catalog tile + page
 * must be TRANSP-only (customers/vendors/sync-health capability boundary).
 *
 * Self-test: node scripts/verify-lists-qbo-bulk-link-transp-only.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  map: "apps/frontend/src/pages/lists/components/AllCatalogsMap.tsx",
  page: "apps/frontend/src/pages/lists/accounting/QBOBulkLinkPage.tsx",
};
const LABEL = "verify-lists-qbo-bulk-link-transp-only";

const MAP_CAPABILITY = /qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/;
const MAP_FILTER = /catalogKey\s*!==\s*"qbo-bulk-link"\s*\|\|\s*qboAvailable/;
const PAGE_CAPABILITY = /qboAvailable\s*=\s*selectedCompany\?\.code\s*===\s*"TRANSP"/;
const PAGE_ENABLED = /enabled:\s*Boolean\(companyId\s*&&\s*qboAvailable\)\s*&&\s*step\s*>=\s*2/;
const PAGE_HONEST = /data-testid="qbo-bulk-link-transp-only"/;

export function audit(src) {
  const failures = [];
  if (!MAP_CAPABILITY.test(src.map)) {
    failures.push(`${FILES.map}: QBO capability must derive from selectedCompany.code === "TRANSP"`);
  }
  if (!MAP_FILTER.test(src.map)) {
    failures.push(`${FILES.map}: qbo-bulk-link catalog tile must filter unless qboAvailable`);
  }
  if (!PAGE_CAPABILITY.test(src.page)) {
    failures.push(`${FILES.page}: QBO capability must derive from selectedCompany.code === "TRANSP"`);
  }
  if (!PAGE_ENABLED.test(src.page)) {
    failures.push(`${FILES.page}: unlinked query must enable only when companyId && qboAvailable`);
  }
  if (!PAGE_HONEST.test(src.page)) {
    failures.push(`${FILES.page}: non-TRANSP must show honest transp-only empty state`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    map: fs.readFileSync(path.join(root, FILES.map), "utf8"),
    page: fs.readFileSync(path.join(root, FILES.page), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["map-capability", "map", MAP_CAPABILITY, "qboAvailable = true"],
    ["map-filter", "map", MAP_FILTER, "true"],
    ["page-capability", "page", PAGE_CAPABILITY, "qboAvailable = true"],
    ["page-enabled", "page", PAGE_ENABLED, "enabled: Boolean(companyId) && step >= 2"],
    ["page-honest", "page", PAGE_HONEST, 'data-testid="qbo-bulk-link-always"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Lists QBO bulk-link is TRANSP-gated`);
process.exit(0);
