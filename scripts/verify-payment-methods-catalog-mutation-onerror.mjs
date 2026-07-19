#!/usr/bin/env node
// verify:payment-methods-catalog-mutation-onerror
// Guard: PaymentMethodsCatalogPage mutations must surface failures via pushToast.
//
// voidMut lacked onError — void failures were silent while create/update/setActive already toast.
// Each useMutation MUST carry onError → pushToast. Additive only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = "apps/frontend/src/pages/accounting/PaymentMethodsCatalogPage.tsx";

function collectFailures(src) {
  const failures = [];
  const onErrorCount = (src.match(/onError\s*:/g) || []).length;
  const mutationCount = (src.match(/useMutation\(/g) || []).length;

  if (mutationCount < 4) {
    failures.push(`expected 4 useMutation() calls, found ${mutationCount}.`);
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
    failures.push("each mutation onError must call pushToast for user-visible failure feedback.");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const good = `
    useMutation({ mutationFn: a, onSuccess: b, onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error") });
    useMutation({ mutationFn: c, onSuccess: d, onError: (err) => pushToast(err instanceof Error ? err.message : "Update failed", "error") });
    useMutation({ mutationFn: e, onSuccess: f, onError: (err) => pushToast(err instanceof Error ? err.message : "Update failed", "error") });
    useMutation({ mutationFn: g, onSuccess: h, onError: (err) => pushToast(err instanceof Error ? err.message : "Void failed", "error") });
  `;
  const bad = `useMutation({ mutationFn: x, onSuccess: y })`;
  if (collectFailures(good).length > 0) {
    console.error("verify:payment-methods-catalog-mutation-onerror --selftest FAIL: good fixture rejected");
    process.exit(1);
  }
  if (collectFailures(bad).length === 0) {
    console.error("verify:payment-methods-catalog-mutation-onerror --selftest FAIL: bad fixture accepted");
    process.exit(1);
  }
  console.log("verify:payment-methods-catalog-mutation-onerror --selftest PASS");
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, file), "utf8");
const failures = collectFailures(src);

if (failures.length > 0) {
  console.error("verify:payment-methods-catalog-mutation-onerror FAIL:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}

const mutationCount = (src.match(/useMutation\(/g) || []).length;
const onErrorCount = (src.match(/onError\s*:/g) || []).length;
console.log(
  `verify:payment-methods-catalog-mutation-onerror PASS (${onErrorCount} onError handlers for ${mutationCount} mutations)`
);
