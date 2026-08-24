#!/usr/bin/env node
/**
 * FAIL-S1 ratchet — safety events must be linkable to their load AT CREATE.
 *
 * Why this guard exists: `safety.safety_events.related_load_id` has always existed, but the Log
 * Safety Event form never sent it, so every row inserted NULL. The table is (correctly) enforced
 * append-only at the database — `UPDATE is not allowed` — so the link can NEVER be repaired after
 * the fact. A create-path omission becomes permanent data loss. That is why this is a ratchet and
 * not a lint.
 *
 * Asserts, on the create path only:
 *   1. the draft type carries related_load_id
 *   2. the create payload sends it
 *   3. a load EntityPicker is rendered in the log modal
 * Fails if the UI offers the field but the payload drops it (or vice versa).
 */
import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
export function collectProblems(src) {
  const problems = [];
  if (!/related_load_id:\s*string;/.test(src)) problems.push("draft type is missing `related_load_id: string;`");
  if (!/related_load_id:\s*draft\.related_load_id\.trim\(\)\s*\|\|\s*undefined/.test(src)) {
    problems.push("create payload does not send related_load_id from the draft");
  }
  const hasLoadKind = /kind="load"/.test(src);
  const hasPickerIdentity = /safety-event-related-load-picker/.test(src);
  if (!hasLoadKind) problems.push('log modal picker must use kind="load"');
  if (!hasPickerIdentity) problems.push("log modal picker must expose safety-event-related-load-picker");
  const sendsField = /related_load_id:\s*draft\.related_load_id/.test(src);
  if ((hasLoadKind && hasPickerIdentity) !== sendsField) {
    problems.push("UI picker and create payload disagree — one sends related_load_id, the other does not");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `
    type Draft = { related_load_id: string; };
    const payload = { related_load_id: draft.related_load_id.trim() || undefined };
    <EntityPicker kind="load" data-testid="safety-event-related-load-picker" />;
  `;
  if (collectProblems(good).length) throw new Error(`good fixture rejected: ${collectProblems(good).join("; ")}`);
  const mutations = [
    [good.replace("related_load_id: string;", "removed_load_id: string;"), "draft type is missing"],
    [good.replace("draft.related_load_id.trim() || undefined", "undefined"), "create payload does not send"],
    [good.replace('kind="load"', 'kind="driver"'), 'must use kind="load"'],
    [good.replace("safety-event-related-load-picker", "removed-load-picker"), "must expose safety-event-related-load-picker"],
    [good.replace("related_load_id: draft.related_load_id", "removed_load_id: draft.related_load_id"), "UI picker and create payload disagree"],
  ];
  for (const [fixture, expected] of mutations) {
    const problems = collectProblems(fixture);
    if (!problems.some((problem) => problem.includes(expected))) {
      throw new Error(`mutation escaped: ${expected} (${JSON.stringify(problems)})`);
    }
  }
  console.log(`PASS verify-safety-event-load-link --selftest ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const fail = collectProblems(readFileSync(FILE, "utf8"));
if (fail.length) {
  console.error("FAIL verify-safety-event-load-link:");
  for (const f of fail) console.error("  - " + f);
  console.error(`\n  ${FILE}`);
  console.error("  safety_events is append-only: a NULL at insert can never be fixed.");
  process.exit(1);
}
console.log("PASS verify-safety-event-load-link — create path writes related_load_id");
