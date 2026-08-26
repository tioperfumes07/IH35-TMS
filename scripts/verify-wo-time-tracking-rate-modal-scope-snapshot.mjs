#!/usr/bin/env node
/**
 * verify-wo-time-tracking-rate-modal-scope-snapshot.mjs
 *
 * MAINT-MONEY-F6626-WO-TIME-RATE-NATIVE-PROMPT-AND-MUTABLE-SCOPE — Work Order Time Tracking's
 * "Rate" action used window.prompt() (an unvalidated raw number, bypassing the canonical QBO
 * money chrome) and its patchMut closed over the LIVE workOrderId/operatingCompanyId props. A
 * work-order/company transition while the request was in flight could update the wrong entry's
 * rate under the wrong company, or invalidate/toast for a no-longer-visible panel.
 *
 * Fixed with a canonical MoneyInput modal (same idiom as factoring/FactoringHome.tsx's loan
 * attribution/payment modal) and the same scope-generation-snapshot idiom used by
 * units/UnitPermitsTab.tsx and insurance/PaymentScheduleTab.tsx.
 *
 * Guards against window.prompt() reappearing on this file, the MoneyInput modal being dropped,
 * or the generation snapshot/check being removed from patchMut.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (/=\s*window\.prompt\(/.test(src)) {
  failures.push(`${filePath}: window.prompt() reintroduced — use the canonical MoneyInput modal instead`);
}
if (!/<MoneyInput valueCents=\{rateEditCents\} onChangeCents=\{setRateEditCents\}/.test(src)) {
  failures.push(`${filePath}: the canonical cents-mode MoneyInput for the labor rate edit is missing`);
}
if (!/const scopeGenerationRef = useRef\(0\)/.test(src)) {
  failures.push(`${filePath}: scopeGenerationRef (scope-generation snapshot) is missing`);
}
if (!/scopeGenerationRef\.current \+= 1/.test(src)) {
  failures.push(`${filePath}: no effect increments scopeGenerationRef on workOrderId/operatingCompanyId change`);
}
if (!/generation: scopeGenerationRef\.current/.test(src)) {
  failures.push(`${filePath}: setRateEdit no longer stamps the current scope generation`);
}
if (!/onSuccess: \(_data, args\) => \{\s*\n\s*if \(args\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: patchMut's onSuccess no longer bails out on a stale generation`);
}
if (!/onError: \(e: unknown, args\) => \{\s*\n\s*if \(args\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: patchMut's onError no longer bails out on a stale generation`);
}
if (!/resetPatchMut\(\)/.test(src)) {
  failures.push(`${filePath}: patchMut is no longer reset on workOrderId/operatingCompanyId change`);
}
if (!/disabled=\{rateEditCents == null \|\| rateEditCents < 0 \|\| !Number\.isFinite\(rateEditCents\)\}/.test(src)) {
  failures.push(`${filePath}: the Save button no longer validates a nonnegative finite rate before submit`);
}

if (failures.length > 0) {
  console.error("verify-wo-time-tracking-rate-modal-scope-snapshot: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-wo-time-tracking-rate-modal-scope-snapshot: OK — labor-rate edit uses the canonical MoneyInput modal, validates the amount, and snapshots work-order/company/generation at submit"
);
