#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["customer"],"leafRe":"^detail\\.(profile|contacts|contacts\\.create|billing|billing\\.record_payment|quality|quality\\.create_event|lanes|lanes\\.create|documents|coi|contracts|portal_users|tasks|loads|pnl|audit|edit|fmcsa_verify)$","task":"LINK-F5165-CUSTOMER-DETAIL-SELF-REFERENTIAL"} */
/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["detail.profile","detail.contacts","detail.contacts.create","detail.billing","detail.billing.record_payment","detail.quality","detail.quality.create_event","detail.lanes","detail.lanes.create","detail.documents","detail.contracts","detail.portal_users","detail.tasks","detail.loads","detail.pnl","detail.audit","detail.edit","detail.fmcsa_verify"],"task":"CUST-F5921-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * OWNER-EXECUTION-PLAN vertical customer-column sweep (2026-08-14): CustomerDetail.tsx's 19 tabs/
 * actions are all genuinely self-referential to THIS customer (the page's own :id route param) —
 * each queryKey/mutation is keyed on `id`, confirmed by direct code citation for every leaf.
 *
 * Self-test: node scripts/verify-customer-detail-page-self-referential.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/CustomerDetail.tsx";
const FMCSA_MODAL = "apps/frontend/src/components/customers/FMCSAVerificationModal.tsx";
const LATE_ARRIVAL_CARD = "apps/frontend/src/components/customers/CustomerLateArrivalCard.tsx";
const RELATIONSHIP_SCORE = "apps/frontend/src/components/customers/CustomerRelationshipScore.tsx";
const REQUIRED = "docs/specs/scoreboard/modules/customers.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-customer-detail-page-self-referential.mjs";
const LABEL = "verify-customer-detail-page-self-referential";
const EXACT_HEADER = '/** @matrix-built {"modules":["customers"],"cols":["connectivity"],"leaves":["detail.profile","detail.contacts","detail.contacts.create","detail.billing","detail.billing.record_payment","detail.quality","detail.quality.create_event","detail.lanes","detail.lanes.create","detail.documents","detail.contracts","detail.portal_users","detail.tasks","detail.loads","detail.pnl","detail.audit","detail.edit","detail.fmcsa_verify"],"task":"CUST-F5921-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const EXACT_ROUTES = new Map([
  ["detail.profile", "/customers/:id"], ["detail.contacts", "/customers/:id?tab=contacts"],
  ["detail.contacts.create", "/customers/:id"], ["detail.billing", "/customers/:id?tab=billing"],
  ["detail.billing.record_payment", "/customers/:id"], ["detail.quality", "/customers/:id?tab=quality"],
  ["detail.quality.create_event", "/customers/:id"], ["detail.lanes", "/customers/:id?tab=lanes"],
  ["detail.lanes.create", "/customers/:id"], ["detail.documents", "/customers/:id?tab=documents"],
  ["detail.contracts", "/customers/:id?tab=contracts"], ["detail.portal_users", "/customers/:id?tab=portal"],
  ["detail.tasks", "/customers/:id?tab=tasks"], ["detail.loads", "/customers/:id?tab=loads"],
  ["detail.pnl", "/customers/:id?tab=pnl"], ["detail.audit", "/customers/:id?tab=audit"],
  ["detail.edit", "/customers/:id"], ["detail.fmcsa_verify", "/customers/:id"],
]);

const CHECKS = [
  ["profile", /updateCustomer\(id, \{/],
  ["contacts", /queryKey: \["customer-contacts", id,/],
  ["contacts.create", /createCustomerContact\(id, payload, operatingCompanyId\)/],
  ["billing", /queryKey: \["customer-billing-summary", id,/],
  ["billing.record_payment", /recordCustomerPayment\(id, selectedCompanyId \?\? "", \{/],
  ["quality", /queryKey: \["customer-quality-events", id,/],
  ["quality.create_event", /createCustomerQualityEvent\(id, \{/],
  ["lanes", /queryKey: \["customer-lanes", id,/],
  ["lanes.create", /createCustomerLane\(id, operatingCompanyId!, payload\)/],
  ["documents", /<DocumentsTab entityType="customer" entityId=\{customer\.id\}/],
  ["coi", /customerId=\{customer\.id\}/],
  ["contracts", /<CustomerContractsTab[\s\S]{0,50}customerId=\{customer\.id\}/],
  ["portal_users", /<PortalUsersTab customerId=\{customer\.id\}/],
  ["tasks", /<TasksTab[\s\S]{0,50}targetType="customer" targetId=\{customer\.id\}/],
  ["loads", /queryKey: \["customer-loads", id,/],
  ["pnl", /queryKey: \["customer-pnl", id,/],
  ["audit", /<EntityAuditHistoryTab operatingCompanyId=\{operatingCompanyId \?\? ""\} entityType="customer" entityId=\{customer\.id\}/],
  ["edit", /await updateCustomer\(id, \{/],
  ["fmcsa_verify", /mutationFn: \(\) => verifyCustomerFmcsa\(id\)/],
];

export function audit(src, fmcsaSrc = "", requiredSrc = "", selfSrc = "", feedSrc = "", lateArrivalSrc = "", relationshipSrc = "") {
  const failures = [];
  for (const [name, pattern] of CHECKS) {
    if (!pattern.test(src)) failures.push(`${FILE}: ${name} tab is missing its self-referential customer scoping`);
  }
  if (!/customerLoadsQuery\.isError[\s\S]{0,500}title="Couldn't load customer loads"[\s\S]{0,500}customerLoadsQuery\.refetch\(\)/.test(src)) {
    failures.push(`${FILE}: customer loads reverse GET failure must reach ParityTable with exact-query retry`);
  }
  for (const [query, title] of [["contactsQuery", "Couldn't load customer contacts"], ["lanesQuery", "Couldn't load customer lanes"], ["qualityEventsQuery", "Couldn't load customer quality history"], ["fmcsaHistoryQuery", "Couldn't load FMCSA verification history"]]) {
    const pattern = new RegExp(`${query}\\.isError[\\s\\S]{0,500}title="${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]{0,500}${query}\\.refetch\\(\\)`);
    if (!pattern.test(src)) failures.push(`${FILE}: ${query} reverse GET failure must render exact-query retry`);
  }
  if (!/!fmcsaHistoryQuery\.isError\s*&&\s*fmcsaHistoryListState\.isEmpty/.test(src)) failures.push(`${FILE}: FMCSA failed GET must not render as empty history`);
  // LST-F3366 — FMCSA verify chrome: flat sections, no nested bordered cards inside Modal.
  if (fmcsaSrc) {
    if (!/data-testid=["']fmcsa-verify-flat["']/.test(fmcsaSrc)) {
      failures.push(`${FMCSA_MODAL}: must expose data-testid=fmcsa-verify-flat`);
    }
    if (/rounded-sm border border-gray-200 p-3/.test(fmcsaSrc)) {
      failures.push(`${FMCSA_MODAL}: must not nest bordered cards (box-in-box)`);
    }
  }
  if (lateArrivalSrc && !/query\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(lateArrivalSrc)) {
    failures.push(`${LATE_ARRIVAL_CARD}: detail late-arrival failure must expose exact-query retry`);
  }
  if (!/relationshipScoreQuery\.isError[\s\S]{0,300}onRetry=\{\(\) => void relationshipScoreQuery\.refetch\(\)\}/.test(src) || (relationshipSrc && !/<ListErrorState[\s\S]{0,180}onRetry=\{onRetry\}/.test(relationshipSrc))) {
    failures.push(`${RELATIONSHIP_SCORE}: failed relationship-score GET must expose exact-query retry`);
  }
  for (const [query, title] of [["usStatesQuery", "Couldn't load billing states"], ["qualityReasonsQuery", "Couldn't load quality reasons"]]) {
    const pattern = new RegExp(`${query}\\.isError[\\s\\S]{0,500}title="${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]{0,500}${query}\\.refetch\\(\\)`);
    if (!pattern.test(src)) failures.push(`${FILE}: ${query} catalog failure must expose exact-query retry`);
  }
  if (requiredSrc) {
    const required = JSON.parse(requiredSrc);
    for (const [id, route] of EXACT_ROUTES) {
      const leaf = required.leaves?.find((row) => row.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${REQUIRED}: ${id} must require connectivity`);
      if (leaf?.route_hint !== route) failures.push(`${REQUIRED}: ${id} must name route ${route}`);
    }
  }
  if (selfSrc && !selfSrc.split("/**\n * OWNER-")[0].includes(EXACT_HEADER)) failures.push(`${SELF}: exact detail connectivity header missing`);
  if (feedSrc && /"guard"\s*:\s*"scripts\/verify-customer-detail-page-self-referential\.mjs"/.test(feedSrc)) failures.push(`${FEED}: manual feed duplicates exact detail connectivity`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const fmcsaGood = fs.readFileSync(path.join(ROOT, FMCSA_MODAL), "utf8");
  const requiredGood = fs.readFileSync(path.join(ROOT, REQUIRED), "utf8");
  const selfGood = fs.readFileSync(path.join(ROOT, SELF), "utf8");
  const feedGood = fs.readFileSync(path.join(ROOT, FEED), "utf8");
  const lateArrivalGood = fs.readFileSync(path.join(ROOT, LATE_ARRIVAL_CARD), "utf8");
  const relationshipGood = fs.readFileSync(path.join(ROOT, RELATIONSHIP_SCORE), "utf8");
  let caught = 0;
  if (audit(good, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood, relationshipGood).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood).join("\n- ")}`);
    process.exit(1);
  }
  const relationshipMutated = good.replace("relationshipScoreQuery.refetch()", "retryRemoved()");
  if (relationshipMutated === good || !audit(relationshipMutated, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood, relationshipGood).some((f) => f.includes("relationship-score GET"))) {
    console.error(`${LABEL} SELFTEST FAIL — relationship-score retry mutation escaped`);
    process.exit(1);
  }
  caught++;
  for (const query of ["usStatesQuery", "qualityReasonsQuery"]) {
    const mutated = good.replace(`${query}.refetch()`, "retryRemoved()");
    if (mutated === good || !audit(mutated, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood, relationshipGood).some((f) => f.includes(`${query} catalog failure`))) {
      console.error(`${LABEL} SELFTEST FAIL — ${query} catalog retry mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, pattern] of CHECKS) {
    const mutated = good.replace(new RegExp(pattern.source, `${pattern.flags}g`), "REMOVED");
    if (mutated === good) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    const failures = audit(mutated, fmcsaGood, requiredGood, selfGood, feedGood);
    if (!failures.some((f) => f.includes(name))) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  const fmcsaPlanted = fmcsaGood.replace(/data-testid=["']fmcsa-verify-flat["']/, 'data-testid="x"') +
    '\n<div className="rounded-sm border border-gray-200 p-3" />\n';
  if (!audit(good, fmcsaPlanted).some((f) => f.includes("box-in-box") || f.includes("fmcsa-verify-flat"))) {
    console.error(`${LABEL} SELFTEST FAIL — fmcsa box-in-box mutation escaped`);
    process.exit(1);
  }
  caught++;
  for (const query of ["contactsQuery", "lanesQuery", "qualityEventsQuery", "fmcsaHistoryQuery"]) {
    const mutated = good.replace(new RegExp(`${query}\\.refetch\\(\\)`), "Promise.resolve()");
    if (mutated === good || !audit(mutated, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood).some((f) => f.includes(`${query} reverse GET failure`))) {
      console.error(`${LABEL} SELFTEST FAIL — ${query} retry mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  const loadsErrorMutated = good.replace(
    /customerLoadsQuery\.refetch\(\)/,
    "Promise.resolve()",
  );
  if (loadsErrorMutated === good || !audit(loadsErrorMutated, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalGood).some((f) => f.includes("customer loads reverse GET failure"))) {
    console.error(`${LABEL} SELFTEST FAIL — customer loads error/retry mutation escaped`);
    process.exit(1);
  }
  caught++;
  const lateArrivalMutated = lateArrivalGood.replace("onRetry={() => void query.refetch()}", "onRetry={() => undefined}");
  if (lateArrivalMutated === lateArrivalGood || audit(good, fmcsaGood, requiredGood, selfGood, feedGood, lateArrivalMutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — late-arrival retry mutation escaped`);
    process.exit(1);
  }
  caught++;
  for (const id of EXACT_ROUTES.keys()) {
    const mutated = requiredGood.replace(`"id": "${id}"`, `"id": "${id}.broken"`);
    if (mutated === requiredGood || audit(good, fmcsaGood, mutated, selfGood, feedGood).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required mutation escaped: ${id}`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, selfMutated, feedMutated] of [
    ["header", selfGood.replace(EXACT_HEADER, EXACT_HEADER.replace("connectivity", "reverse_link")), feedGood],
    ["feed", selfGood, feedGood.replace("[", `[{"guard":"scripts/verify-customer-detail-page-self-referential.mjs"},`)],
  ]) {
    if (audit(good, fmcsaGood, requiredGood, selfMutated, feedMutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} evidence mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(
  fs.readFileSync(path.join(ROOT, FILE), "utf8"),
  fs.readFileSync(path.join(ROOT, FMCSA_MODAL), "utf8"),
  fs.readFileSync(path.join(ROOT, REQUIRED), "utf8"),
  fs.readFileSync(path.join(ROOT, SELF), "utf8"),
  fs.readFileSync(path.join(ROOT, FEED), "utf8"),
  fs.readFileSync(path.join(ROOT, LATE_ARRIVAL_CARD), "utf8"),
  fs.readFileSync(path.join(ROOT, RELATIONSHIP_SCORE), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — CustomerDetail's ${CHECKS.length} tabs/actions are real, self-referential customer wiring`);
