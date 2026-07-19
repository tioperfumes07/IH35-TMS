#!/usr/bin/env node
// verify:posting-lineage-onerror
// Guard: PostingLineagePage lineageQuery mutation must surface failures via pushToast.
//
// Without onError, a failed lineage lookup is silent aside from isError banner state — the user
// gets no toast feedback when the mutation rejects. The lineageQuery MUST carry onError → pushToast.
// Additive only. LINKAGE: posting lineage drill -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/PostingLineagePage.tsx";

function collectFailures(src) {
  const failures = [];
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;

  if (mutationCount < 1) {
    failures.push(`expected >=1 useMutation() call (lineageQuery), found ${mutationCount}.`);
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
    failures.push("lineageQuery onError must call pushToast for user-visible failure feedback.");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `useMutation({ mutationFn: x, onError: (err) => pushToast(err instanceof Error ? err.message : "Failed", "error") })`;
  const bad = `useMutation({ mutationFn: x })`;
  if (collectFailures(good).length > 0) {
    console.error("verify:posting-lineage-onerror --selftest FAIL: good fixture rejected");
    process.exit(1);
  }
  if (collectFailures(bad).length === 0) {
    console.error("verify:posting-lineage-onerror --selftest FAIL: bad fixture accepted");
    process.exit(1);
  }
  console.log("verify:posting-lineage-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const failures = collectFailures(src);

if (failures.length > 0) {
  console.error("verify:posting-lineage-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

const mutationCount = (src.match(/useMutation\(/g) || []).length;
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
console.log(
  `verify:posting-lineage-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`
);
