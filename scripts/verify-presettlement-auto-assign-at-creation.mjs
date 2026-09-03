#!/usr/bin/env node
/**
 * verify-presettlement-auto-assign-at-creation.mjs
 *
 * Owner ruling 2026-09-03 (settled, do not re-litigate): "The instant a load is CREATED it joins
 * a pre-settlement. Not at delivery. Not at invoice. At creation... Assignment is automatic.
 * Closing is human-confirmed." Supersedes the earlier GO-22 "recommend, never auto-commit" design.
 *
 * Two live gaps this closes in book-load.service.ts:
 *   1. Linking was OPT-IN (gated behind input.addToOpenPresettlement, which BookLoadModalV4.tsx
 *      defaults to false) -- now unconditional whenever a driver + trip_type are known.
 *   2. Linking only ever SUGGESTED (suggestPresettlementLink), never confirmed -- a load could sit
 *      forever as a pending suggestion nobody actioned. confirmPresettlementLink now runs
 *      immediately after, in the same transaction as booking.
 */
import { readFileSync } from "node:fs";

const ROUTE_PATH = "apps/backend/src/dispatch/book-load.service.ts";

function loadSource() {
  return readFileSync(ROUTE_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (/if \(input\.addToOpenPresettlement\)/.test(src)) {
    failures.push("presettlement linking is still gated behind the opt-in input.addToOpenPresettlement flag");
  }
  if (!/confirmPresettlementLink,\s*suggestPresettlementLink/.test(src) && !/suggestPresettlementLink,\s*confirmPresettlementLink/.test(src)) {
    failures.push("confirmPresettlementLink is not imported alongside suggestPresettlementLink");
  }
  const suggestIdx = src.indexOf("const suggestion = await suggestPresettlementLink(client,");
  const confirmIdx = src.indexOf("await confirmPresettlementLink(client,");
  if (suggestIdx === -1) failures.push("suggestPresettlementLink call site not found in the expected shape");
  if (confirmIdx === -1) failures.push("confirmPresettlementLink is never called");
  if (suggestIdx !== -1 && confirmIdx !== -1 && confirmIdx < suggestIdx) {
    failures.push("confirmPresettlementLink is called before suggestPresettlementLink resolves a target");
  }
  if (!/action: suggestion\.suggested_settlement_id \? "link_existing" : "create_new"/.test(src)) {
    failures.push("auto-confirm does not correctly branch create_new vs link_existing off the suggestion result");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-presettlement-auto-assign-at-creation SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();
  const mutations = [
    ["opt-in gate reintroduced", "if (input.assigned_primary_driver_id && input.trip_type) {", "if (input.addToOpenPresettlement) {\n      if (input.assigned_primary_driver_id && input.trip_type) {"],
    ["confirm call removed", 'await confirmPresettlementLink(client, {\n          operating_company_id: input.operating_company_id,\n          suggestion_id: suggestion.suggestion_id,\n          action: suggestion.suggested_settlement_id ? "link_existing" : "create_new",\n          actor_user_id: input.requestingUserUuid,\n        });', "// confirm removed"],
    ["branch logic flipped", 'action: suggestion.suggested_settlement_id ? "link_existing" : "create_new"', 'action: "create_new"'],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-presettlement-auto-assign-at-creation SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-presettlement-auto-assign-at-creation SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-presettlement-auto-assign-at-creation: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-presettlement-auto-assign-at-creation: OK — every load with a driver+trip_type is auto-linked to a pre-settlement at booking, unconditionally, no human confirm step required");
