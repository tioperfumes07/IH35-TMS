#!/usr/bin/env node
/**
 * verify-insurance-payment-schedule-mark-paid-scope-snapshot.mjs
 *
 * INSURANCE-MONEY-F6628-PAYMENT-SCHEDULE-MARK-PAID-MUTABLE-SCOPE — the Insurance Payment
 * Schedule's money-bearing "Mark paid" action used to submit only scheduleId, with its
 * mutation/onSuccess/onError closing over the LIVE (mutable) operatingCompanyId/policyId
 * props. A company or policy transition during the in-flight request could post the write
 * under the wrong company, or invalidate/toast for the wrong now-visible context.
 *
 * Fixed with the SAME scope-generation-snapshot idiom already used by
 * units/UnitPermitsTab.tsx's deleteMutation: a ref incremented on scope-key change, the
 * mutation's variables carry an immutable snapshot (including the generation), and
 * onSuccess/onError bail out if the generation has since moved on.
 *
 * Guards against reverting to a bare scheduleId mutate() call or dropping the generation
 * check from onSuccess/onError.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/insurance/PaymentScheduleTab.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (!/const scopeGenerationRef = useRef\(0\)/.test(src)) {
  failures.push(`${filePath}: scopeGenerationRef (scope-generation snapshot) is missing`);
}
if (!/scopeGenerationRef\.current \+= 1/.test(src)) {
  failures.push(`${filePath}: no effect increments scopeGenerationRef on operatingCompanyId/policyId change`);
}
if (!/markPaidMutation\.mutate\(\{\s*\n?\s*scheduleId:/.test(src)) {
  failures.push(`${filePath}: markPaidMutation is no longer called with a snapshot object (scheduleId/operatingCompanyId/policyId/generation) — a bare scheduleId reintroduces the stale-closure bug`);
}
if (!/generation: scopeGenerationRef\.current/.test(src)) {
  failures.push(`${filePath}: the mutate() call no longer stamps the current scope generation`);
}
if (!/onSuccess: \(_data, input\) => \{\s*\n\s*if \(input\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: onSuccess no longer bails out when input.generation !== scopeGenerationRef.current`);
}
if (!/onError: \(_error, input\) => \{\s*\n\s*if \(input\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
  failures.push(`${filePath}: onError no longer bails out when input.generation !== scopeGenerationRef.current`);
}
if (!/resetMarkPaidMutation\(\)/.test(src)) {
  failures.push(`${filePath}: markPaidMutation is no longer reset on operatingCompanyId/policyId change`);
}

if (failures.length > 0) {
  console.error("verify-insurance-payment-schedule-mark-paid-scope-snapshot: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-insurance-payment-schedule-mark-paid-scope-snapshot: OK — mark-paid mutation snapshots company/policy/generation at submit and bails on a stale scope transition"
);
