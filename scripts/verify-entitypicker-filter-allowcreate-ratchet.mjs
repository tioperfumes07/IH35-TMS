#!/usr/bin/env node
/**
 * CLS-EP-FILTER-ALLOWCREATE — filter EntityPickers must set allowCreate={false}.
 *
 * EXCEPTION — apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx was removed from
 * FILTER_PAGES 2026-08-22 (LST-ORPH-04-GUARD-CONFLICT-ASSIGNMENT-HISTORY): a later, deliberate
 * decision (DISP-ASSIGNMENT-HISTORY-DRIVER-PICKER-LAW, PR #9371, 2026-08-18 — 13 days after this
 * guard's own PR #4425) explicitly flipped that page's Driver EntityPicker BACK to allowCreate ON
 * to satisfy the "secondary.assignments:picker_law" scoreboard credit, and shipped its own
 * dedicated guard (verify-assignment-history-driver-picker-law.mjs) asserting the OPPOSITE
 * requirement. The two guards directly contradicted each other on live main — this guard still
 * failing, the other one passing — because this file's page list was never updated when the later
 * decision landed. This guard's scope narrows to the 3 pages it was originally proven against
 * (all three still carry an explicit "filters, not creators" comment citing SAF-F26/F28/Idvr law);
 * AssignmentHistoryPage's own guard is now sole authority for that one field.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-entitypicker-filter-allowcreate-ratchet";
const FILTER_PAGES = [
  "apps/frontend/src/pages/safety/AccidentsPage.tsx",
  "apps/frontend/src/pages/safety/SafetyEventsPage.tsx",
  "apps/frontend/src/pages/safety/IdvrPage.tsx",
];
export function collectProblems(root = ROOT) {
  const p = [];
  for (const rel of FILTER_PAGES) {
    const s = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/EntityPicker/.test(s) || !/allowCreate=\{false\}/.test(s)) {
      p.push(`${rel}: filter EntityPicker must set allowCreate={false}`);
    }
  }
  return p;
}
if (process.argv.includes("--selftest")) {
  // Real mutation selftest (the prior version unconditionally printed OK with no assertion at
  // all): swap a real page's guaranteed-present allowCreate={false} for allowCreate={true} in a
  // throwaway copy and confirm collectProblems() flags it.
  // NOTE: process.exit() does not run pending `finally` blocks in Node — every failure path below
  // records a message and falls through to the shared cleanup/exit at the bottom instead of
  // exiting mid-try, so the temp dir is never leaked regardless of which assertion fails.
  const tmpRoot = fs.mkdtempSync(path.join(ROOT, "scripts", ".ep-filter-allowcreate-selftest-"));
  let failure = null;
  try {
    for (const rel of FILTER_PAGES) {
      const abs = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), abs);
    }
    const clean = collectProblems(tmpRoot);
    if (clean.length) {
      failure = `clean copy already flagged: ${clean.join("; ")}`;
    } else {
      const target = path.join(tmpRoot, FILTER_PAGES[0]);
      const original = fs.readFileSync(target, "utf8");
      // collectProblems() only checks that at least ONE allowCreate={false} occurs anywhere in the
      // file, so every occurrence must be mutated for the plant to actually violate the invariant.
      const mutated = original.replace(/allowCreate=\{false\}/g, "allowCreate={true}");
      if (mutated === original) {
        failure = "mutation did not change the file (pattern drifted)";
      } else {
        fs.writeFileSync(target, mutated);
        const planted = collectProblems(tmpRoot);
        if (!planted.some((m) => m.includes(FILTER_PAGES[0]))) {
          failure = "planted allowCreate flip was not caught";
        }
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
  if (failure) {
    console.error(LABEL, "SELFTEST FAIL —", failure);
    process.exit(1);
  }
  console.log(LABEL, "SELFTEST OK — planted allowCreate flip caught, clean tree stays clean");
  process.exit(0);
}
const f = collectProblems();
if (f.length) {
  console.error(LABEL, "FAIL", f.join("\n"));
  process.exit(1);
}
console.log(LABEL, "OK");
