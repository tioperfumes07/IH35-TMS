#!/usr/bin/env node
/**
 * verify-legal-matter-timeline-note-creator.mjs
 * LV-LEGAL-MATTER-TIMELINE-RAW-JSON-CREATOR
 *
 * Timeline must use a typed note creator (event_type=note, plain note body),
 * readiness-disabled submit, and human note rendering — never raw JSON authoring.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-matter-timeline-note-creator";
const TARGET = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

function analyze(src) {
  const failures = [];
  if (/placeholder=["']event_type["']/.test(src) || /placeholder=\{?['"]event_type['"]\}?/.test(src)) {
    failures.push("must not expose free-form event_type authoring");
  }
  if (/event_body JSON|JSON\.parse\(eventBody/.test(src)) {
    failures.push("must not author/parse raw event_body JSON in the UI");
  }
  if (/JSON\.stringify\(ev\.event_body/.test(src)) {
    failures.push("must not render timeline bodies as raw JSON.stringify");
  }
  if (!/event_type:\s*"note"/.test(src)) {
    failures.push("manual creator must post event_type: \"note\"");
  }
  if (!/event_body:\s*\{\s*note\s*\}/.test(src) && !/event_body:\s*\{\s*note\s*,/.test(src)) {
    failures.push("manual creator must post event_body: { note }");
  }
  if (!/noteText\.trim\(\)\.length === 0/.test(src) && !/!noteText\.trim\(\)/.test(src)) {
    failures.push("Create note must be readiness-disabled when note empty");
  }
  if (!/formatLegalMatterEventBody/.test(src)) {
    failures.push("timeline list must render via formatLegalMatterEventBody");
  }
  if (/Create event/.test(src) && !/Create note/.test(src)) {
    failures.push("submit label must be Create note (typed note creator)");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = `
    const note = noteText.trim();
    legalMattersApi.addEvent(companyId, id, { event_type: "note", event_body: { note } });
    disabled={addEventMut.isPending || noteText.trim().length === 0}
    Create note
    <p>{formatLegalMatterEventBody(ev)}</p>
  `;
  const badJson = good.replace("formatLegalMatterEventBody(ev)", "JSON.stringify(ev.event_body, null, 2)");
  const badType = `
    placeholder="event_type"
    JSON.parse(eventBody || "{}")
    Create event
  `;
  if (analyze(good).length) fail(`selftest GOOD: ${analyze(good).join("; ")}`);
  if (!analyze(badJson).length) fail("selftest expected BAD json render to fail");
  if (!analyze(badType).length) fail("selftest expected BAD type authoring to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const failures = analyze(src);
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — typed timeline note creator`);
