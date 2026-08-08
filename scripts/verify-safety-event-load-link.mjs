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
const src = readFileSync(FILE, "utf8");
const fail = [];

if (!/related_load_id:\s*string;/.test(src))
  fail.push("draft type is missing `related_load_id: string;`");

if (!/related_load_id:\s*draft\.related_load_id\.trim\(\)\s*\|\|\s*undefined/.test(src))
  fail.push("create payload does not send related_load_id from the draft");

const hasLoadPicker = /kind="load"/.test(src) && /safety-event-related-load-picker/.test(src);
if (!hasLoadPicker)
  fail.push('log modal is missing the load EntityPicker (kind="load", testid safety-event-related-load-picker)');

// Both-or-neither: a picker the payload ignores is worse than no picker.
const sendsField = /related_load_id:\s*draft\.related_load_id/.test(src);
if (hasLoadPicker !== sendsField)
  fail.push("UI picker and create payload disagree — one sends related_load_id, the other does not");

if (fail.length) {
  console.error("FAIL verify-safety-event-load-link:");
  for (const f of fail) console.error("  - " + f);
  console.error(`\n  ${FILE}`);
  console.error("  safety_events is append-only: a NULL at insert can never be fixed.");
  process.exit(1);
}
console.log("PASS verify-safety-event-load-link — create path writes related_load_id");
