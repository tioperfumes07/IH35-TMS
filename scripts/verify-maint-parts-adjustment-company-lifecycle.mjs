#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity","qbo_chrome"],"leaves":["parts_inventory.record_purchase"],"task":"MAINT-F6632-PARTS-ADJUSTMENT-COMPANY-LIFECYCLE","vertical":"column-wave"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/const adjustmentGenerationRef = useRef\(0\)/, "adjustment generation exists"],
  [/mutationFn: \(input: \{[\s\S]*rowId: string;[\s\S]*companyId: string;[\s\S]*generation: number;[\s\S]*deltaQty: number;[\s\S]*reason:[\s\S]*\}\) => adjustPartsInventory\(input\.rowId, input\.companyId, \{ delta_qty: input\.deltaQty, reason: input\.reason \}\)/, "adjustment submits immutable row company delta and reason"],
  [/onSuccess: async \(_result, input\) => \{\s*if \(input\.generation !== adjustmentGenerationRef\.current\) return;[\s\S]*await invalidatePartsStockQueries\(queryClient, input\.companyId\);/, "adjustment rejects stale success and refreshes all submitted-company stock readers"],
  [/onError: \(err, input\) => \{\s*if \(input\.generation === adjustmentGenerationRef\.current\)/, "adjustment rejects stale error"],
  [/useEffect\(\(\) => \{[\s\S]{0,120}adjustmentGenerationRef\.current \+= 1;[\s\S]{0,120}adjustMutation\.reset\(\);[\s\S]{0,120}setAdjustRow\(null\);[\s\S]{0,120}setDeltaQty\(0\);[\s\S]{0,120}setReason\("recount"\);[\s\S]{0,420}purchaseMutation\.reset\(\);[\s\S]{0,120}setOpenPurchase\(false\);[\s\S]{0,120}setForm\(EMPTY_PURCHASE\);[\s\S]{0,120}setLastGlPosting\(null\);[\s\S]{0,80}\}, \[companyId\]\)/, "company switch retires both mutations and clears both drafts"],
  [/adjustMutation\.mutate\(\{\s*rowId: adjustRow\.id,\s*companyId,\s*generation: adjustmentGenerationRef\.current,\s*deltaQty,\s*reason,\s*\}\)/, "Apply Adjustment snapshots full intent"],
  [/const purchaseMutation = useMutation\(\{\s*mutationFn: \(input: \{ companyId: string; generation: number; draft: PurchaseForm \}\) =>\s*recordPartsPurchase\(input\.companyId, \{[\s\S]{0,520}part_description: input\.draft\.part_description,[\s\S]{0,520}purchase_amount: input\.draft\.purchase_amount,[\s\S]{0,160}\}\)/, "purchase path snapshots company generation and complete draft"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maint-parts-adjustment-company-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maint-parts-adjustment-company-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maint-parts-adjustment-company-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maint-parts-adjustment-company-lifecycle PASS — ${checks.length} scoped adjustment invariants`);
