#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow"],"cols":["connectivity","reverse_link"],"leafRe":"^cash-flow\\.panel\\.projection$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["customers"],"cols":["connectivity","reverse_link"],"leafRe":"^detail\\.profile$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["drivers"],"cols":["connectivity","reverse_link"],"leafRe":"^profiles\\.detail$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity","reverse_link"],"leafRe":"^unit\\.profile\\.safety_reverse$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["vendors"],"cols":["connectivity","reverse_link"],"leafRe":"^detail\\.profile$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity","reverse_link"],"leafRe":"^dispatch\\.modal\\.save_load_template$","task":"REVERSE-PROFILE-PREVIEWS-SILENT-FIVE-ROW-CAP","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-reverse-profile-preview-all-row-access";
const FILES = {
  forecastReverse: "apps/frontend/src/components/cash-flow/CashForecastReverseSection.tsx",
  forecastList: "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
  templateReverse: "apps/frontend/src/components/dispatch/CustomerLoadTemplatesReverseSection.tsx",
  templateLibrary: "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx",
  templateApi: "apps/frontend/src/api/dispatch.ts",
  templateService: "apps/backend/src/dispatch/dispatch-refinements.service.ts",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
  cargoClaims: "apps/frontend/src/components/safety/CustomerCargoClaimsReverseSection.tsx",
  customerNotify: "apps/frontend/src/components/dispatch/CustomerNotifyReverseSection.tsx",
  dispatcherSafety: "apps/frontend/src/components/safety/DispatcherSafetyEventsReverseBlock.tsx",
};
const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

const checks = [
  ["forecastReverse", /const preview = entries\.slice\(0, 5\)[\s\S]*Showing \{preview\.length\} of \{entries\.length\}[\s\S]*Open all \{entries\.length\}/, "cash projection preview discloses its exact total and all-row action"],
  ["forecastReverse", /URLSearchParams\(\{ tab: "manual_daily_projections" \}\)[\s\S]*Object\.entries\(filter\)[\s\S]*allParams\.toString\(\)/, "cash projection all-row link preserves the profile filter"],
  ["forecastList", /searchParams\.get\("party_ref_kind"\)[\s\S]{0,500}searchParams\.get\("party_ref_id"\)[\s\S]{0,500}searchParams\.get\("ref_kind"\)[\s\S]{0,500}searchParams\.get\("ref_external_id"\)/, "manual projections consume every supported reverse filter"],
  ["forecastList", /queryKey: \["forecast", "entries", operatingCompanyId, reverseFilter\][\s\S]{0,160}listForecastEntries\(operatingCompanyId, undefined, undefined, reverseFilter\)/, "manual projections key and fetch the canonical filtered list"],
  ["templateService", /COUNT\(\*\) OVER\(\) AS total_count[\s\S]{0,220}scopedAllRows \? "" : "LIMIT 500"[\s\S]{0,250}return \{ templates, total \}/, "load-template service returns an honest total and uncaps exact scoped reads"],
  ["templateApi", /apiRequest<\{ templates: LoadTemplateRow\[\]; total: number \}>/, "load-template client carries the server total"],
  ["templateReverse", /const total = query\.data\?\.total \?\? templates\.length[\s\S]{0,1200}Showing \{preview\.length\} of \{total\}[\s\S]{0,500}Open all \{total\}/, "customer template preview discloses total and all-row action"],
  ["templateReverse", /\/dispatch\/planner\?panel=templates&customer_id=\$\{encodeURIComponent\(customerId\)\}/, "customer template all-row link preserves customer scope on the mounted route"],
  // Real code routes the deep-link customer_id through the governed useStagedListFilters pipeline
  // (searchParams -> deepLinkCustomerId -> customerIdFromUrl -> applied.customerId -> effectiveCustomerId)
  // rather than a direct inline variable — same architectural migration class fixed repeatedly this
  // session. The scoping is still genuinely honored end-to-end; only the variable name and gap widened.
  ["templateLibrary", /searchParams\.get\("customer_id"\)[\s\S]{0,1500}listLoadTemplates\(operatingCompanyId, \{ template_id: templateId, customer_id: effectiveCustomerId \}\)/, "template library consumes the reverse customer filter"],
  ["templateLibrary", /CappedListNotice shown=\{rows\.length\}[\s\S]{0,180}total=\{q\.data\?\.total \?\? null\}/, "template library discloses any unfiltered server cap"],
  ["templateLibrary", /CappedListNotice shown=\{templates\.length\} limit=\{500\}[\s\S]{0,100}total=\{q\.data\?\.total \?\? null\}/, "load-template picker discloses its catalog cap"],
  ["entityLink", /case "load_template":[\s\S]{0,100}return `\/dispatch\/planner\?panel=templates&template_id=\$\{id\}`/, "exact load-template EntityLink targets the mounted planner route"],
  ["templateReverse", /<ListErrorState[\s\S]{0,180}query\.refetch\(\)/, "customer template failure retries exact query"],
  ["cargoClaims", /<ListErrorState[\s\S]{0,180}query\.refetch\(\)/, "customer cargo-claim failure retries exact query"],
  ["customerNotify", /preferences\.refetch\(\)[\s\S]{0,300}log\.refetch\(\)/, "customer notification failures retry exact independent queries"],
  ["dispatcherSafety", /<ListErrorState[\s\S]{0,180}query\.refetch\(\)/, "dispatcher safety failure retries exact query"],
];

function failures(candidate) {
  return checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , description]) => description);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["forecastReverse", "Showing {preview.length} of {entries.length}", "Showing recent projections"],
    ["forecastReverse", "for (const [key, value] of Object.entries(filter))", "for (const [key, value] of Object.entries({}))"],
    ["forecastList", 'searchParams.get("party_ref_id")', 'new URLSearchParams().get("party_ref_id")'],
    ["forecastList", "listForecastEntries(operatingCompanyId, undefined, undefined, reverseFilter)", "listForecastEntries(operatingCompanyId)"],
    ["templateService", "COUNT(*) OVER() AS total_count", "1 AS total_count"],
    ["templateApi", "templates: LoadTemplateRow[]; total: number", "templates: LoadTemplateRow[]"],
    ["templateReverse", "Showing {preview.length} of {total}", "Showing recent templates"],
    ["templateReverse", "/dispatch/planner?panel=templates&customer_id=", "/dispatch/planner?panel=templates&all="],
    ["templateLibrary", 'searchParams.get("customer_id")', 'new URLSearchParams().get("customer_id")'],
    ["templateLibrary", '<CappedListNotice shown={rows.length}', '<div data-removed-notice={rows.length}'],
    ["templateLibrary", '<CappedListNotice shown={templates.length}', '<div data-removed-picker-notice={templates.length}'],
    ["entityLink", "/dispatch/planner?panel=templates&template_id=", "/dispatch/planning/calendar?panel=templates&template_id="],
    ["templateReverse", "query.refetch()", "retryRemoved()"],
    ["cargoClaims", "query.refetch()", "retryRemoved()"],
    ["customerNotify", "preferences.refetch()", "retryRemoved()"],
    ["dispatcherSafety", "query.refetch()", "retryRemoved()"],
  ];
  const escaped = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) { escaped.push(`${key}: mutation anchor missing (${needle})`); continue; }
    const mutant = { ...sources, [key]: sources[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) escaped.push(`${key}: planted defect escaped (${needle})`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(sources);
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — every capped profile preview exposes scoped total and canonical all-row access`);
