#!/usr/bin/env node
// SETTLEMENT-TOUR-NUMBER-SWEEP root-cause fix (2026-09-11, docs/audit/SETTLEMENT-TOUR-NUMBER-SWEEP-2026-09-11.md
// "REMAINING"): named as the exact mechanism that produced orphan loads 13581/13580/13508 --
// presettlement-link.service.ts's deferred path (trip_type unknown at booking or post-assignment)
// used to write ONLY a dispatch.load.presettlement_link_deferred audit-log entry and return; no
// row in the human-review queue table driver_finance.presettlement_link_suggestions, and nothing
// ever read that audit event back. Separately, the GO-22 human-confirm queue's own backend routes
// (GET/POST /driver-finance/presettlement-suggestions) had existed with ZERO frontend caller
// anywhere in the app -- built, never surfaced.
//
// This guard asserts BOTH halves of the fix hold:
//  1. Both deferred-write call sites (presettlement-link.service.ts's post-assignment hook, and
//     book-load.service.ts's own booking-time branch) call recordDeferredPresettlementSuggestion
//     instead of (or in addition to) the bare audit log, so a deferred load becomes visible.
//  2. A real frontend page actually calls listPresettlementSuggestions /
//     confirmPresettlementSuggestion -- the queue is genuinely reachable by a human, not just
//     defined and unused.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const PRESETTLEMENT_LINK_SERVICE = path.join(repoRoot, "apps/backend/src/dispatch/presettlement-link.service.ts");
const BOOK_LOAD_SERVICE = path.join(repoRoot, "apps/backend/src/dispatch/book-load.service.ts");
const DRIVER_FINANCE_API = path.join(repoRoot, "apps/frontend/src/api/driverFinance.ts");
const SUGGESTIONS_TAB = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/components/PresettlementSuggestionsTab.tsx");
const SETTLEMENTS_PAGE = path.join(repoRoot, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");

/** Pure: does presettlement-link.service.ts export the shared writer and call it from the
 *  post-assignment defer branch? */
export function auditPresettlementLinkServiceSource(src) {
  const failures = [];
  if (!/export\s+async\s+function\s+recordDeferredPresettlementSuggestion/.test(src)) {
    failures.push("recordDeferredPresettlementSuggestion is not exported -- book-load.service.ts cannot reuse it");
  }
  // Isolate the after-assignment function's body and check ITS defer branch specifically.
  const fnMatch = src.match(/export async function linkLoadToPresettlementAfterAssignmentInClientTx[\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("could not find linkLoadToPresettlementAfterAssignmentInClientTx to inspect its defer branch");
  } else if (!/recordDeferredPresettlementSuggestion\s*\(/.test(fnMatch[0])) {
    failures.push("linkLoadToPresettlementAfterAssignmentInClientTx's trip_type-unknown branch does not call recordDeferredPresettlementSuggestion -- still audit-log-only, invisible again");
  }
  return failures;
}

/** Pure: does book-load.service.ts's own inline defer branch call the shared writer when a
 *  driver IS known? */
export function auditBookLoadServiceSource(src) {
  const failures = [];
  if (!/recordDeferredPresettlementSuggestion\s*\(/.test(src)) {
    failures.push("book-load.service.ts's booking-time defer branch does not call recordDeferredPresettlementSuggestion -- a load booked with a known driver but unknown trip_type is still invisible");
  }
  return failures;
}

/** Pure: does the frontend api layer + a real page wire up the queue end to end? */
export function auditFrontendWiring(apiSrc, tabSrc, pageSrc) {
  const failures = [];
  if (!/export function listPresettlementSuggestions/.test(apiSrc)) failures.push("driverFinance.ts: listPresettlementSuggestions is missing");
  if (!/export function confirmPresettlementSuggestion/.test(apiSrc)) failures.push("driverFinance.ts: confirmPresettlementSuggestion is missing");
  if (!/listPresettlementSuggestions\s*\(/.test(tabSrc)) failures.push("PresettlementSuggestionsTab.tsx does not call listPresettlementSuggestions");
  if (!/confirmPresettlementSuggestion\s*\(/.test(tabSrc)) failures.push("PresettlementSuggestionsTab.tsx does not call confirmPresettlementSuggestion");
  if (!/PresettlementSuggestionsTab/.test(pageSrc)) failures.push("SettlementsPage.tsx does not render PresettlementSuggestionsTab -- the tab exists but is unreachable from any page");
  return failures;
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const badService = `
export async function linkLoadToPresettlementAfterAssignmentInClientTx(client, input) {
  if (!input.trip_type) {
    await appendCrudAudit(client, input.actor_user_id, "dispatch.load.presettlement_link_deferred", {}, "info", "REG-008");
    return null;
  }
}
`;
  assert.ok(
    auditPresettlementLinkServiceSource(badService).length >= 2,
    "the pre-fix shape (no export, audit-only defer) must fail on multiple checks"
  );

  const goodService = `
export async function recordDeferredPresettlementSuggestion(client, input) { return { suggestion_id: "x" }; }

export async function linkLoadToPresettlementAfterAssignmentInClientTx(client, input) {
  if (!input.trip_type) {
    await recordDeferredPresettlementSuggestion(client, { load_id: input.load_id });
    return null;
  }
}
`;
  assert.ok(auditPresettlementLinkServiceSource(goodService).length === 0, "the fixed shape must pass");

  assert.ok(
    auditBookLoadServiceSource("await appendCrudAudit(client, u, \"dispatch.load.presettlement_link_deferred\", {}, \"info\", \"P6-D2\");").length === 1,
    "the pre-fix book-load shape (audit-only) must fail"
  );
  assert.ok(
    auditBookLoadServiceSource("await recordDeferredPresettlementSuggestion(client, { load_id: load.id });").length === 0,
    "the fixed book-load shape must pass"
  );

  const goodApi = `
export function listPresettlementSuggestions(companyId) { return apiRequest(\`/x?\${q(companyId)}\`); }
export function confirmPresettlementSuggestion(id, payload) { return apiRequest(\`/x/\${id}/confirm\`, { method: "POST", body: payload }); }
`;
  const goodTab = `
listPresettlementSuggestions(companyId);
confirmPresettlementSuggestion(id, { action: "reject" });
`;
  const goodPage = `import { PresettlementSuggestionsTab } from "./components/PresettlementSuggestionsTab";`;
  assert.ok(auditFrontendWiring(goodApi, goodTab, goodPage).length === 0, "the fully-wired frontend shape must pass");
  assert.ok(auditFrontendWiring("", "", "").length === 5, "a completely missing wiring must fail every check");
  assert.ok(auditFrontendWiring(goodApi, goodTab, "").length === 1, "a built-but-unrendered tab must be caught");

  console.log("verify-presettlement-deferred-suggestions-visible --selftest PASS");
}

function run() {
  const failures = [];
  const readOrEmpty = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : (failures.push(`${path.relative(repoRoot, p)}: missing`), ""));

  const presettlementLinkSrc = readOrEmpty(PRESETTLEMENT_LINK_SERVICE);
  if (presettlementLinkSrc) failures.push(...auditPresettlementLinkServiceSource(presettlementLinkSrc).map((f) => `presettlement-link.service.ts: ${f}`));

  const bookLoadSrc = readOrEmpty(BOOK_LOAD_SERVICE);
  if (bookLoadSrc) failures.push(...auditBookLoadServiceSource(bookLoadSrc).map((f) => `book-load.service.ts: ${f}`));

  const apiSrc = readOrEmpty(DRIVER_FINANCE_API);
  const tabSrc = readOrEmpty(SUGGESTIONS_TAB);
  const pageSrc = readOrEmpty(SETTLEMENTS_PAGE);
  if (apiSrc && tabSrc && pageSrc) failures.push(...auditFrontendWiring(apiSrc, tabSrc, pageSrc));

  if (failures.length) {
    console.error("verify-presettlement-deferred-suggestions-visible FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-presettlement-deferred-suggestions-visible: OK -- both deferred-write call sites make " +
      "the load visible in the review queue, and a real frontend page (SettlementsPage's Needs " +
      "Review tab) lets a human see and act on it"
  );
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
