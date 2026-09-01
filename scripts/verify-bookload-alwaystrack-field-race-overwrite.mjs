#!/usr/bin/env node
/**
 * BOOKLOAD-ALWAYSTRACK-FIELD-RACE-OVERWRITE — Book Load must not clobber a dispatcher-typed
 * AlwaysTrack load # when template/OCR/reservation refresh re-applies prefill JSON.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const modalPath = path.join(root, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");
const guardPath = path.join(root, "apps/frontend/src/pages/dispatch/components/book-load-v4/liveLoadNumberFieldGuard.ts");
const applyPath = path.join(root, "apps/frontend/src/pages/dispatch/components/book-load-v4/applyBookLoadPrefill.ts");

const modal = readFileSync(modalPath, "utf8");
const guard = readFileSync(guardPath, "utf8");
const apply = readFileSync(applyPath, "utf8");

const failures = [];

if (!guard.includes("markLiveLoadNumberUserTyped")) {
  failures.push("liveLoadNumberFieldGuard missing markLiveLoadNumberUserTyped");
}
if (!guard.includes("setLiveLoadNumberUnlessUserTyped")) {
  failures.push("liveLoadNumberFieldGuard missing setLiveLoadNumberUnlessUserTyped");
}
if (!guard.includes("applyLiveLoadNumberFromJsonUnlessUserTyped")) {
  failures.push("liveLoadNumberFieldGuard missing applyLiveLoadNumberFromJsonUnlessUserTyped");
}
if (!/if \(ref\.current\) return/.test(guard)) {
  failures.push("liveLoadNumberFieldGuard must bail when user typed");
}
if (!apply.includes("applyBookLoadPrefillToForm")) {
  failures.push("applyBookLoadPrefill missing applyBookLoadPrefillToForm");
}
if (!apply.includes("applyLiveLoadNumberFromJsonUnlessUserTyped")) {
  failures.push("applyBookLoadPrefill must guard live_load_number from JSON");
}
if (!modal.includes("applyBookLoadPrefillToForm")) {
  failures.push("BookLoadModalV4 must route template/OCR prefill through applyBookLoadPrefillToForm");
}
if (!modal.includes("markLiveLoadNumberUserTyped")) {
  failures.push("BookLoadModalV4 must mark live_load_number when the dispatcher types");
}
if (!modal.includes('autoComplete="off"') || !modal.includes("book-load-live-load-number")) {
  failures.push("BookLoadModalV4 live_load_number input must disable browser autofill (autoComplete=off)");
}
if (!modal.includes("liveLoadNumberUserTypedRef")) {
  failures.push("BookLoadModalV4 must keep liveLoadNumberUserTypedRef across reservation refresh");
}
if (!modal.includes("autoPrefillAppliedKeyRef")) {
  failures.push("BookLoadModalV4 must dedupe automatic templatePrefillJson re-application per open session");
}
if (modal.includes("applyLoadTemplateToBookForm(form.setValue")) {
  failures.push("BookLoadModalV4 must not call applyLoadTemplateToBookForm directly (use guarded wrapper)");
}

if (process.argv.includes("--selftest")) {
  const badModal = modal.replace('autoComplete="off"', "");
  if (badModal.includes('autoComplete="off"')) {
    console.error("selftest: could not plant BookLoadModalV4 mutation");
    process.exit(1);
  }
  const badGuard = guard.replace("if (ref.current) return;", "");
  if (/if \(ref\.current\) return/.test(badGuard)) {
    console.error("selftest: planted guard mutation still detected");
    process.exit(1);
  }
  console.log("verify-bookload-alwaystrack-field-race-overwrite selftest: planted failures would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-bookload-alwaystrack-field-race-overwrite FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-bookload-alwaystrack-field-race-overwrite PASS");
process.exit(0);
