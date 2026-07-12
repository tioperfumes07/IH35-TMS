#!/usr/bin/env node
// verify:dispatch-notify-prefs-onerror
// Guard for 0441-mod4-dispatch-notify-prefs-no-onerror.
//
// The customer notification-preferences toggles fire fire-and-forget mutations. Without an onError
// handler a failed save is silent — the toggle appears to have saved when it did not. Both mutations
// (saveM, syncM) MUST carry an onError that surfaces feedback. This guard fails if either regresses to
// no onError. Additive only. LINKAGE: dispatch notify prefs -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx";

if (process.argv.includes("--selftest")) {
  const sample = "useMutation({ mutationFn: x, onSuccess: y, onError: z })";
  if (!/onError/.test(sample)) { console.error("selftest FAIL"); process.exit(1); }
  console.log("verify:dispatch-notify-prefs-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
const mutationCount = (src.match(/useMutation\(/g) || []).length;

const failures = [];
if (mutationCount < 2) {
  failures.push(`expected >=2 useMutation() calls (saveM + syncM), found ${mutationCount}.`);
}
if (onErrorCount < mutationCount) {
  failures.push(`each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`);
}
if (!src.includes("pushToast")) {
  failures.push("no pushToast — error feedback is not surfaced to the user.");
}

if (failures.length > 0) {
  console.error("verify:dispatch-notify-prefs-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`verify:dispatch-notify-prefs-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`);
