#!/usr/bin/env node
/**
 * verify-policy-create-wizard-scope-snapshot.mjs
 *
 * INS-MONEY-F6843A-POLICY-WITH-BILLS-CREATE-MUTABLE-SCOPE-PENDING-DISMISS — PolicyCreateWizard's
 * createMutation used to submit a zero-input mutate() whose mutationFn/onSuccess/onError closed
 * over the LIVE operatingCompanyId prop (and, transitively, vendor/unit selections that could have
 * been made under an earlier company — the wizard only reset its form state on `open`, never on an
 * operatingCompanyId change while already open). A company transition mid-flight could commit a
 * policy + bill set against the wrong company, or fire the success toast/onCreated navigation for a
 * context the user has already navigated away from. ParityDrawer's onClose (X / backdrop / Escape)
 * and the step-1 Cancel button also invoked the raw onClose prop unconditionally, letting the
 * wizard appear to dismiss while a create-with-bills write could still land moments later.
 *
 * Fixed with the SAME scope-generation-snapshot idiom already used by
 * PaymentScheduleTab.tsx's markPaidMutation / units/UnitPermitsTab.tsx's deleteMutation: a ref
 * bumped on scope-key (operatingCompanyId) change, the mutation's variables carry an immutable
 * snapshot (including the generation), onSuccess/onError bail if the generation has since moved
 * on, and the mutation resets on a company transition. onClose is guarded so it no-ops while the
 * create write is in flight.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx";

export function check(src) {
  const failures = [];

  if (!/const scopeGenerationRef = useRef\(0\)/.test(src)) {
    failures.push(`${FILE}: scopeGenerationRef (scope-generation snapshot) is missing`);
  }
  if (!/scopeGenerationRef\.current \+= 1;[\s\S]{0,80}if \(!open\) return;/.test(src)) {
    failures.push(`${FILE}: the reset effect no longer bumps scopeGenerationRef before its early return`);
  }
  if (!/\}, \[open, operatingCompanyId\]\);/.test(src)) {
    failures.push(`${FILE}: the reset effect no longer depends on operatingCompanyId — a company switch while the wizard stays open would leave stale vendor/unit selections in place`);
  }
  if (!/generation: number/.test(src)) {
    failures.push(`${FILE}: createMutation's mutationFn no longer accepts a generation-stamped input`);
  }
  if (!/onSuccess: \(result, input\) => \{\s*\n\s*if \(input\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
    failures.push(`${FILE}: onSuccess no longer bails out when input.generation !== scopeGenerationRef.current`);
  }
  if (!/onError: \(err, input\) => \{\s*\n\s*if \(input\.generation !== scopeGenerationRef\.current\) return;/.test(src)) {
    failures.push(`${FILE}: onError no longer bails out when input.generation !== scopeGenerationRef.current`);
  }
  if (!/resetCreateMutation\(\)/.test(src)) {
    failures.push(`${FILE}: createMutation is no longer reset on an operatingCompanyId change`);
  }
  if (!/generation: scopeGenerationRef\.current,/.test(src)) {
    failures.push(`${FILE}: submitCreatePolicy no longer stamps the current scope generation onto the mutate() call`);
  }

  // Dismiss guard: ParityDrawer's onClose and the step-1 Cancel button must route through a
  // pending-aware wrapper, not the raw onClose prop.
  if (!/const guardedOnClose = \(\) => \{\s*\n\s*if \(createMutation\.isPending\) return;\s*\n\s*onClose\(\);/.test(src)) {
    failures.push(`${FILE}: guardedOnClose no longer bails while createMutation.isPending`);
  }
  if (!/<ParityDrawer open=\{open\} onClose=\{guardedOnClose\}/.test(src)) {
    failures.push(`${FILE}: ParityDrawer is no longer wired to guardedOnClose — a raw onClose can dismiss the wizard mid-persistence again`);
  }
  if (!/onClick=\{step === 1 \? guardedOnClose : \(\) => setStep\(\(s\) => s - 1\)\}/.test(src)) {
    failures.push(`${FILE}: the step-1 Cancel button no longer routes through guardedOnClose`);
  }

  return failures;
}

function run() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(src);
  if (failures.length > 0) {
    console.error("FAIL: policy-create-wizard-scope-snapshot");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: policy create-with-bills mutation snapshots company/generation at submit, bails on a stale company transition, and refuses drawer/Cancel dismissal while pending"
  );
}

function selftest() {
  const src = fs.readFileSync(path.join(root, FILE), "utf8");
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: drop operatingCompanyId from the reset effect's deps (the exact pre-fix shape).
  const offenderA = src.replace("}, [open, operatingCompanyId]);", "}, [open]);");
  if (offenderA === src) {
    console.error("FAIL(selftest): offender A mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (reset effect not keyed on operatingCompanyId) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: onSuccess no longer checks the generation (the exact pre-fix shape — fires
  // unconditionally on whatever is now visible).
  const offenderB = src.replace(
    "onSuccess: (result, input) => {\n      if (input.generation !== scopeGenerationRef.current) return;\n      pushToast(",
    "onSuccess: (result) => {\n      pushToast("
  );
  if (offenderB === src) {
    console.error("FAIL(selftest): offender B mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (onSuccess generation check removed) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: ParityDrawer wired back to the raw onClose (the exact pre-fix shape).
  const offenderC = src.replace(
    '<ParityDrawer open={open} onClose={guardedOnClose}',
    '<ParityDrawer open={open} onClose={onClose}'
  );
  if (offenderC === src) {
    console.error("FAIL(selftest): offender C mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (ParityDrawer onClose reverted to raw onClose) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
