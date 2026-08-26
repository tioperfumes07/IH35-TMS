#!/usr/bin/env node
/**
 * verify-fine-lifecycle-scope-snapshot.mjs
 *
 * SAFETY-MONEY-F6634-FINE-LIFECYCLE-MUTABLE-RECORD-COMPANY-DRAFT-SCOPE — Fine Detail's contest,
 * dismiss, reduce, and link-payment mutations were all zero-argument writers that closed over
 * mutable fineId, selected company, notes, reduction amount/reason, bank transaction, paid date,
 * and paid amount, with no record/company lifecycle reset or generation guard anywhere in the
 * component. Switching fine or company — or editing a draft — while any of these liability/GL-
 * bearing requests was in flight could submit or disclose completion against a different intent.
 *
 * Fixed with the same scope-generation-snapshot idiom already shipped 5 times this session
 * (UnitPermitsTab, PaymentScheduleTab, WOTimeTrackingPanel, EscrowRecordTab,
 * PartsInventoryTable), applied to all four mutations sharing one generation ref.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/safety/components/FineLifecycleActions.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (!/const scopeGenerationRef = useRef\(0\)/.test(src)) {
  failures.push(`${filePath}: scopeGenerationRef (scope-generation snapshot) is missing`);
}
if (!/scopeGenerationRef\.current \+= 1/.test(src)) {
  failures.push(`${filePath}: no effect increments scopeGenerationRef on fineId/operatingCompanyId change`);
}

const mutations = [
  { name: "contestMutation", callArgs: "{ fineId, operatingCompanyId, generation: scopeGenerationRef.current, notes }" },
  { name: "dismissMutation", callArgs: "{ fineId, operatingCompanyId, generation: scopeGenerationRef.current, notes }" },
];
for (const m of mutations) {
  if (!src.includes(`${m.name}.mutate(${m.callArgs})`)) {
    failures.push(`${filePath}: ${m.name} is no longer called with a {fineId, operatingCompanyId, generation, notes} snapshot`);
  }
}
if (!/reduceMutation\.mutate\(\{\s*\n\s*fineId,\s*\n\s*operatingCompanyId,\s*\n\s*generation: scopeGenerationRef\.current,\s*\n\s*amountCents: reduceAmountCents \?\? 0,\s*\n\s*reason: reduceReason\.trim\(\),\s*\n\s*\}\)/.test(src)) {
  failures.push(`${filePath}: reduceMutation is no longer called with a full scope+draft snapshot`);
}
if (!/linkPaymentMutation\.mutate\(\{\s*\n\s*fineId,\s*\n\s*operatingCompanyId,\s*\n\s*generation: scopeGenerationRef\.current,\s*\n\s*bankTransactionId: String\(bankTransactionId \?\? ""\),\s*\n\s*paidDate,\s*\n\s*paidAmountCents: paidAmountCents \?\? 0,\s*\n\s*\}\)/.test(src)) {
  failures.push(`${filePath}: linkPaymentMutation is no longer called with a full scope+draft snapshot`);
}

const bailOutCount = (src.match(/if \(input\.generation !== scopeGenerationRef\.current\) return;/g) ?? []).length;
if (bailOutCount < 4) {
  failures.push(`${filePath}: expected 4 onSuccess generation bail-out checks (one per mutation), found ${bailOutCount}`);
}

for (const resetFn of ["resetContestMutation", "resetDismissMutation", "resetReduceMutation", "resetLinkPaymentMutation"]) {
  if (!src.includes(`${resetFn}();`)) {
    failures.push(`${filePath}: ${resetFn}() is no longer called in the fine/company-change reset effect`);
  }
}

if (failures.length > 0) {
  console.error("verify-fine-lifecycle-scope-snapshot: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-fine-lifecycle-scope-snapshot: OK — all 4 fine lifecycle mutations snapshot fine/company/generation/draft at submit and reset on a record or company transition"
);
