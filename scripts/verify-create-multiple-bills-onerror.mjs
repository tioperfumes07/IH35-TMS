#!/usr/bin/env node
// verify:create-multiple-bills-onerror
// Guard: CreateMultipleBillsPage bulk-create mutation must surface failures via pushToast.
//
// Without onError, an unexpected mutation failure (e.g. cache invalidation throw) is silent —
// the user sees no feedback while bills may or may not have posted. The createMutation MUST carry
// onError → pushToast. Additive only. LINKAGE: bulk bill create -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx";

function collectFailures(src) {
  const failures = [];
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;

  if (mutationCount < 1) {
    failures.push(`expected >=1 useMutation() call (createMutation), found ${mutationCount}.`);
  }
  if (onErrorCount < mutationCount) {
    failures.push(
      `each useMutation must have an onError: found ${onErrorCount} onError for ${mutationCount} mutations.`
    );
  }
  if (!src.includes("pushToast")) {
    failures.push("no pushToast — error feedback is not surfaced to the user.");
  }
  if (!/onError:\s*\([^)]*\)\s*=>\s*\n?\s*pushToast/.test(src) && !/onError:\s*\([^)]*\)\s*=>\s*pushToast/.test(src)) {
    failures.push("createMutation onError must call pushToast for user-visible failure feedback.");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `useMutation({ mutationFn: x, onSuccess: y, onError: (error) => pushToast(String(error), "error") })`;
  const bad = `useMutation({ mutationFn: x, onSuccess: y })`;
  if (collectFailures(good).length > 0) {
    console.error("verify:create-multiple-bills-onerror --selftest FAIL: good fixture rejected");
    process.exit(1);
  }
  if (collectFailures(bad).length === 0) {
    console.error("verify:create-multiple-bills-onerror --selftest FAIL: bad fixture accepted");
    process.exit(1);
  }
  console.log("verify:create-multiple-bills-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const failures = collectFailures(src);

if (failures.length > 0) {
  console.error("verify:create-multiple-bills-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

const mutationCount = (src.match(/useMutation\(/g) || []).length;
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
console.log(
  `verify:create-multiple-bills-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`
);
