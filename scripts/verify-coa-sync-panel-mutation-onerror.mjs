#!/usr/bin/env node
// verify:coa-sync-panel-mutation-onerror
// Guard for ChartOfAccountsSyncPanel silent mutation failures.
//
// The QBO CoA sync panel fires pull + reconcile mutations from toolbar buttons. Without onError
// handlers a failed refresh/reconcile is silent — the user sees no feedback while status stays stale.
// Both mutations MUST carry onError that surfaces pushToast feedback. Additive only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/ChartOfAccountsSyncPanel.tsx";

// 443.137 9e (CC-2), guard change — OLD: >=2 useMutation() (pull + reconcile), each with onError.
// NEW: >=1 (pull), each with onError, and NO call to chart-of-accounts/reconcile-now. WHY: since
// ACCT-F4431380 (#26728) that route always answers 409 QBO_NATIVE_WRITE_REFUSED (QuickBooks is a
// read-only archive), so the Reconcile button was removed rather than left broken. The selftest is
// now real: it runs audit() on planted sources instead of regex-testing a constant.
function audit(src) {
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;
  const failures = [];
  if (mutationCount < 1) failures.push(`expected >=1 useMutation() call (pull), found ${mutationCount}.`);
  if (onErrorCount < mutationCount) {
    failures.push(`each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`);
  }
  if (!src.includes("pushToast")) failures.push("no pushToast — error feedback is not surfaced to the user.");
  if (!src.includes("useToast")) failures.push("no useToast — error feedback hook is missing.");
  // Comments are prose, not call sites (the panel explains the removal in a comment).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (/reconcile-now/.test(code)) failures.push("calls chart-of-accounts/reconcile-now — it always answers 409 QBO_NATIVE_WRITE_REFUSED; remove the action.");
  return failures;
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");

if (process.argv.includes("--selftest")) {
  const plants = [
    ["missing onError", src.replace(/onError\s*:/, "onErrorX:"), /onError/],
    ["reconcile action re-added", src + '\nuseMutation({ mutationFn: () => postCoaAction("/api/v1/qbo-sync/chart-of-accounts/reconcile-now", id), onError: () => pushToast("x") });', /reconcile-now/],
  ];
  const bad = plants.filter(([, planted, re]) => planted === src || !audit(planted).some((f) => re.test(f)));
  if (audit(src).length || bad.length) {
    console.error("verify:coa-sync-panel-mutation-onerror --selftest FAIL", audit(src), bad.map((b) => b[0]));
    process.exit(1);
  }
  console.log(`verify:coa-sync-panel-mutation-onerror --selftest PASS (${plants.length}/${plants.length} plants caught)`);
  process.exit(0);
}

const onErrorCount = (src.match(/onError\s*:/g) || []).length;
const mutationCount = (src.match(/useMutation\(/g) || []).length;
const failures = audit(src);

if (failures.length > 0) {
  console.error("verify:coa-sync-panel-mutation-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`verify:coa-sync-panel-mutation-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`);
