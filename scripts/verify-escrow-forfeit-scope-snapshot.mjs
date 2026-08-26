#!/usr/bin/env node
/**
 * verify-escrow-forfeit-scope-snapshot.mjs
 *
 * SAFETY-MONEY-F6635-ESCROW-FORFEIT-MUTABLE-COMPANY-RECORD-SCOPE — Escrow Record forfeiture
 * passed row/amount/reason/liability as mutation variables but closed over the LIVE (mutable)
 * selected operatingCompanyId inside mutationFn/onSuccess, and onSuccess unconditionally cleared
 * the modal selection. A company transition during this liability-bearing request could submit
 * the old escrow row under the NEW company, or disclose/clear completion in whatever company
 * happens to be visible when the response lands.
 *
 * Fixed with the same scope-generation-snapshot idiom already shipped for
 * units/UnitPermitsTab.tsx, insurance/PaymentScheduleTab.tsx, and
 * work-orders/WOTimeTrackingPanel.tsx.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (!/const scopeGenerationRef = useRef\(0\)/.test(src)) {
  failures.push(`${filePath}: scopeGenerationRef (scope-generation snapshot) is missing`);
}
if (!/scopeGenerationRef\.current \+= 1/.test(src)) {
  failures.push(`${filePath}: no effect increments scopeGenerationRef on operatingCompanyId change`);
}
if (!/forfeitMutation\.mutate\(\{ row: selected, operatingCompanyId, generation: scopeGenerationRef\.current, \.\.\.payload \}\)/.test(src)) {
  failures.push(`${filePath}: forfeitMutation is no longer called with an operatingCompanyId/generation snapshot`);
}
if (!/operating_company_id: payload\.operatingCompanyId/.test(src)) {
  failures.push(`${filePath}: mutationFn no longer submits the SNAPSHOTTED operatingCompanyId (reverted to the live/mutable prop)`);
}
if (!/onSuccess: \(result, payload\) => \{\s*\n\s*if \(payload\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: onSuccess no longer bails out on a stale generation`);
}
if (!/onError: \(_error, payload\) => \{\s*\n\s*if \(payload\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: onError no longer bails out on a stale generation`);
}
if (!/resetForfeitMutation\(\)/.test(src)) {
  failures.push(`${filePath}: forfeitMutation is no longer reset on operatingCompanyId change`);
}

if (failures.length > 0) {
  console.error("verify-escrow-forfeit-scope-snapshot: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-escrow-forfeit-scope-snapshot: OK — escrow forfeiture snapshots company/generation at submit and bails on a stale scope transition"
);
