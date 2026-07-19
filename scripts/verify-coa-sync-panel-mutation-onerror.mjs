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

if (process.argv.includes("--selftest")) {
  const sample = "useMutation({ mutationFn: x, onSuccess: y, onError: z })";
  if (!/onError/.test(sample)) {
    console.error("selftest FAIL");
    process.exit(1);
  }
  console.log("verify:coa-sync-panel-mutation-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
const mutationCount = (src.match(/useMutation\(/g) || []).length;

const failures = [];
if (mutationCount < 2) {
  failures.push(`expected >=2 useMutation() calls (pull + reconcile), found ${mutationCount}.`);
}
if (onErrorCount < mutationCount) {
  failures.push(`each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`);
}
if (!src.includes("pushToast")) {
  failures.push("no pushToast — error feedback is not surfaced to the user.");
}
if (!src.includes("useToast")) {
  failures.push("no useToast — error feedback hook is missing.");
}

if (failures.length > 0) {
  console.error("verify:coa-sync-panel-mutation-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`verify:coa-sync-panel-mutation-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`);
