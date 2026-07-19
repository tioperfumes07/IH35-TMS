#!/usr/bin/env node
// verify:accounting-audit-trail-mutation-onerror
// Guard: AccountingAuditTrailPage lineageMut must surface failures via pushToast.
//
// Without onError, a rejected getAccountingSourceLineage call is silent — the user clicks
// "Source lineage" and sees no feedback while the panel stays empty. lineageMut MUST carry
// onError → pushToast. Additive only. LINKAGE: audit trail source lineage -> user feedback (toast).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx";

function collectFailures(src) {
  const failures = [];
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;

  if (mutationCount < 1) {
    failures.push(`expected >=1 useMutation() call (lineageMut), found ${mutationCount}.`);
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
    failures.push("lineageMut onError must call pushToast for user-visible failure feedback.");
  }
  if (!src.includes("useToast")) {
    failures.push("useToast hook must be imported and used for mutation error feedback.");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `import { useToast } from "../../components/Toast";
const { pushToast } = useToast();
useMutation({ mutationFn: x, onSuccess: y, onError: (err) => pushToast(err instanceof Error ? err.message : "fail", "error") })`;
  const bad = `useMutation({ mutationFn: x, onSuccess: y })`;
  if (collectFailures(good).length > 0) {
    console.error("verify:accounting-audit-trail-mutation-onerror --selftest FAIL: good fixture rejected");
    process.exit(1);
  }
  if (collectFailures(bad).length === 0) {
    console.error("verify:accounting-audit-trail-mutation-onerror --selftest FAIL: bad fixture accepted");
    process.exit(1);
  }
  console.log("verify:accounting-audit-trail-mutation-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const failures = collectFailures(src);

if (failures.length > 0) {
  console.error("verify:accounting-audit-trail-mutation-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

const mutationCount = (src.match(/useMutation\(/g) || []).length;
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
console.log(
  `verify:accounting-audit-trail-mutation-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`
);
