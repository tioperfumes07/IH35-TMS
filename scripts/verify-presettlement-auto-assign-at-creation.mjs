#!/usr/bin/env node
/**
 * verify-presettlement-auto-assign-at-creation.mjs
 *
 * SET-01 (owner ruling 2026-09-03/09-04, settled): "The instant a load is CREATED it joins a
 * pre-settlement. Not at delivery. Not at invoice. At creation... Assignment is automatic.
 * Closing is human-confirmed." Supersedes the earlier GO-22 "recommend, never auto-commit" design.
 *
 * Two live gaps this closes, spanning both files in the call chain:
 *   1. book-load.service.ts: linking was OPT-IN (gated behind input.addToOpenPresettlement, which
 *      BookLoadModalV4.tsx defaults to false) -- now unconditional whenever a driver + trip_type
 *      are known, and calls the shared linkLoadToPresettlementAtBookingInClientTx.
 *   2. presettlement-link.service.ts: that shared function must call suggestPresettlementLink
 *      THEN confirmPresettlementLink in the SAME call, back to back -- a load could otherwise sit
 *      forever as a pending suggestion nobody actioned. This is the transaction-trace proof: the
 *      confirm call must be textually inside the same function, after the suggest call resolves.
 */
import { readFileSync } from "node:fs";

const BOOK_LOAD_PATH = "apps/backend/src/dispatch/book-load.service.ts";
const LINK_SERVICE_PATH = "apps/backend/src/dispatch/presettlement-link.service.ts";

function load(path) {
  return readFileSync(path, "utf8");
}

export function collectFailures({ bookLoad = load(BOOK_LOAD_PATH), linkService = load(LINK_SERVICE_PATH) } = {}) {
  const failures = [];

  // book-load.service.ts: unconditional call, no opt-in gate, correct extracted function.
  if (/if \(input\.addToOpenPresettlement\)/.test(bookLoad)) {
    failures.push("book-load.service.ts still gates presettlement linking behind the opt-in input.addToOpenPresettlement flag");
  }
  if (!/await linkLoadToPresettlementAtBookingInClientTx\(client, \{/.test(bookLoad)) {
    failures.push("book-load.service.ts does not call linkLoadToPresettlementAtBookingInClientTx");
  }
  if (!/if \(input\.assigned_primary_driver_id && input\.trip_type\) \{\s*(?:const\s+\w+\s*=\s*)?await linkLoadToPresettlementAtBookingInClientTx/.test(bookLoad)) {
    failures.push("linkLoadToPresettlementAtBookingInClientTx is not called immediately when driver+trip_type are known");
  }

  // presettlement-link.service.ts: the shared function itself suggests THEN confirms, in order,
  // inside the SAME function body -- this is the transaction-trace proof that a load can never
  // exist linked-but-unconfirmed.
  const fnStart = linkService.indexOf("export async function linkLoadToPresettlementAtBookingInClientTx");
  if (fnStart === -1) {
    failures.push("presettlement-link.service.ts does not export linkLoadToPresettlementAtBookingInClientTx");
  } else {
    const fnBody = linkService.slice(fnStart);
    const suggestIdx = fnBody.indexOf("const suggestion = await suggestPresettlementLink(client,");
    const confirmIdx = fnBody.indexOf("const confirmed = await confirmPresettlementLink(client,");
    if (suggestIdx === -1) failures.push("linkLoadToPresettlementAtBookingInClientTx does not call suggestPresettlementLink");
    if (confirmIdx === -1) failures.push("linkLoadToPresettlementAtBookingInClientTx does not call confirmPresettlementLink");
    if (suggestIdx !== -1 && confirmIdx !== -1 && confirmIdx < suggestIdx) {
      failures.push("confirmPresettlementLink is called before suggestPresettlementLink resolves a target");
    }
    if (!fnBody.includes('const action: "create_new" | "link_existing" = suggestion.suggested_settlement_id ? "link_existing" : "create_new";')) {
      failures.push("auto-confirm does not correctly branch create_new vs link_existing off the suggestion result");
    }
    if (!fnBody.includes('if (confirmed.status !== "confirmed" || !confirmed.settlement_id) {')) {
      failures.push("linkLoadToPresettlementAtBookingInClientTx does not fail loud when confirm does not confirm");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-presettlement-auto-assign-at-creation SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const bookLoad = load(BOOK_LOAD_PATH);
  const linkService = load(LINK_SERVICE_PATH);

  // Proven failing on the ACTUAL pre-fix shape (PR #20157's own predecessor), not a synthetic
  // fixture: the historical opt-in gate this migration replaced.
  const preFixBookLoad = bookLoad.replace(
    "if (input.assigned_primary_driver_id && input.trip_type) {",
    "if (input.addToOpenPresettlement) {"
  );
  if (preFixBookLoad === bookLoad) {
    console.error("verify-presettlement-auto-assign-at-creation SELFTEST FAIL — pre-fix plant target not found (source drifted)");
    process.exit(1);
  }
  if (collectFailures({ bookLoad: preFixBookLoad, linkService }).length === 0) {
    console.error("verify-presettlement-auto-assign-at-creation SELFTEST FAIL — pre-fix opt-in-gated shape was NOT caught");
    process.exit(1);
  }

  const mutations = [
    [
      "confirm call removed from the shared function",
      'const confirmed = await confirmPresettlementLink(client, {\n    operating_company_id: input.operating_company_id,\n    suggestion_id: suggestion.suggestion_id,\n    action,\n    actor_user_id: input.actor_user_id,\n  });',
      "// confirm removed",
    ],
    [
      "branch logic flipped to always create_new",
      'const action: "create_new" | "link_existing" = suggestion.suggested_settlement_id ? "link_existing" : "create_new";',
      'const action: "create_new" | "link_existing" = "create_new";',
    ],
    [
      "book-load call site removed",
      "await linkLoadToPresettlementAtBookingInClientTx(client, {",
      "// call removed ({",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    const inBookLoad = bookLoad.includes(from);
    const inLinkService = linkService.includes(from);
    if (!inBookLoad && !inLinkService) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const args = inLinkService
      ? { bookLoad, linkService: linkService.replace(from, to) }
      : { bookLoad: bookLoad.replace(from, to), linkService };
    if (collectFailures(args).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-presettlement-auto-assign-at-creation SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-presettlement-auto-assign-at-creation SELFTEST PASS — pre-fix shape caught + ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-presettlement-auto-assign-at-creation: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-presettlement-auto-assign-at-creation: OK — every load with a driver+trip_type is auto-linked to a pre-settlement at booking, unconditionally, suggest+confirm in the same call, no human confirm step required");
