#!/usr/bin/env node
/**
 * verify-parts-purchase-scope-snapshot.mjs
 *
 * MAINT-MONEY-F6631-PARTS-PURCHASE-MUTABLE-COMPANY-DRAFT-SCOPE — Parts Inventory "Save Purchase"
 * was a zero-argument mutation whose writer closed over the LIVE (mutable) companyId AND every
 * live `form` field, and whose onSuccess closed over the current companyId for stock/purchase-
 * history invalidation and published the returned GL result unconditionally. A company switch
 * or a draft edit while the request was pending could submit/refresh a different scope than the
 * operator confirmed, or surface stale GL feedback on the next entity.
 *
 * Fixed by submitting one immutable {companyId, generation, draft} input (a cloned draft) and
 * reusing the SAME company-scoped generation ref this file's own adjustMutation already
 * established (bumped on companyId change) — one scope boundary, two mutations.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (!/mutationFn: \(input: \{ companyId: string; generation: number; draft: PurchaseForm \}\) =>/.test(src)) {
  failures.push(`${filePath}: purchaseMutation's mutationFn no longer takes an immutable {companyId, generation, draft} input`);
}
if (!/purchaseMutation\.mutate\(\{ companyId, generation: adjustmentGenerationRef\.current, draft: \{ \.\.\.form \} \}\)/.test(src)) {
  failures.push(`${filePath}: Save Purchase no longer submits a cloned draft + company + generation snapshot`);
}
if (!/onSuccess: async \(created, input\) => \{\s*\n\s*if \(input\.generation !== adjustmentGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: purchaseMutation's onSuccess no longer bails out on a stale generation`);
}
if (!/onError: \(err, input\) => \{\s*\n\s*if \(input\.generation !== adjustmentGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: purchaseMutation's onError no longer bails out on a stale generation`);
}
if (!/purchaseMutation\.reset\(\);\s*\n\s*setOpenPurchase\(false\);\s*\n\s*setForm\(EMPTY_PURCHASE\);\s*\n\s*setLastGlPosting\(null\);/.test(src)) {
  failures.push(`${filePath}: the companyId-change effect no longer resets purchaseMutation/openPurchase/form/lastGlPosting`);
}

if (failures.length > 0) {
  console.error("verify-parts-purchase-scope-snapshot: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-parts-purchase-scope-snapshot: OK — Save Purchase snapshots company/generation/draft at submit and resets on a company transition"
);
