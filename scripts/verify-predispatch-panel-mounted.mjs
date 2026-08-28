#!/usr/bin/env node
// Guard (GAP-14): the Book Load modal's Section D must mount the LIVE PreDispatchValidationPanel
// (which calls /api/v1/dispatch/validation/pre-dispatch with the actual selected driver/unit/
// customer) — not regress to the static "5 of 5 checks pass" stub. Also: the panel must not leak
// internal block language ("GAP-14") into the rendered UI (§7 no-internal-language-in-prod-ui).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-predispatch-panel-mounted: ${m}`); process.exit(1); };

const modal = readFileSync(join(root, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"), "utf8");

// Live panel is imported and mounted, fed by the watched assignment inputs.
if (!/import \{ PreDispatchValidationPanel \}/.test(modal)) fail("PreDispatchValidationPanel not imported in BookLoadModalV4");
if (!/<PreDispatchValidationPanel\b/.test(modal)) fail("PreDispatchValidationPanel not mounted in BookLoadModalV4");
for (const prop of [
  /driverUuid=\{assignedPrimaryDriverId/,
  /unitUuid=\{assignedUnitId/,
  /customerId=\{watchedCustomerId/,
  /onValidationChange=/,
]) {
  if (!prop.test(modal)) fail(`PreDispatchValidationPanel missing wired prop: ${prop}`);
}
// The hardcoded always-pass meta must be gone (it lied even with an expired-CDL driver).
if (/5 of 5 checks pass/.test(modal)) fail('static "5 of 5 checks pass" meta must be replaced by live validation state');

const panel = readFileSync(join(root, "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx"), "utf8");
// No internal block id rendered as visible UI text.
if (/<span[^>]*>GAP-14<\/span>/.test(panel)) fail('panel must not render the internal "GAP-14" label in prod UI');
// Panel must keep calling the live backend endpoint.
if (!/dispatch\/validation\/pre-dispatch/.test(panel)) fail("panel must call /api/v1/dispatch/validation/pre-dispatch");

function failureContractHolds(source) {
  const catchStart = source.indexOf(".catch((err) => {");
  const catchEnd = catchStart >= 0 ? source.indexOf(".finally(", catchStart) : -1;
  const catchBlock = catchStart >= 0 && catchEnd > catchStart ? source.slice(catchStart, catchEnd) : "";
  return (
    catchBlock.includes("setError(") &&
    catchBlock.includes("onValidationChange?.(false, false)") &&
    !catchBlock.includes("onValidationChange?.(true, false)")
  );
}

function recoveryContractHolds(source) {
  const effectStart = source.indexOf("useEffect(() => {");
  const emptyStart = source.indexOf("if (!driverUuid && !unitUuid && !customerId)", effectStart);
  const preEmptyBlock = effectStart >= 0 && emptyStart > effectStart ? source.slice(effectStart, emptyStart) : "";
  return (
    preEmptyBlock.includes("setLoading(false)") &&
    preEmptyBlock.includes("setError(null)") &&
    preEmptyBlock.includes("setAcknowledgedRules(new Set())") &&
    /\[inputKey, retryGeneration\]/.test(source) &&
    /onClick=\{\(\) => setRetryGeneration\(\(generation\) => generation \+ 1\)\}/.test(source) &&
    />\s*Retry\s*</.test(source)
  );
}

if (!failureContractHolds(panel)) {
  fail("failed validation preview must report not-passing without fabricating a blocker");
}
if (!recoveryContractHolds(panel)) {
  fail("validation identity transitions must clear retired state and failed reads must expose exact Retry");
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["failure reports passing", panel.replace("onValidationChange?.(false, false);", "onValidationChange?.(true, false);")],
    ["failure drops parent signal", panel.replace("onValidationChange?.(false, false);", "")],
    ["empty identity stays loading", panel.replace("setLoading(false);", "")],
    ["failed read has no retry", panel.replace(/onClick=\{\(\) => setRetryGeneration\([\s\S]*?\}\n/, "")],
  ];
  let caught = 0;
  for (const [name, source] of mutations) {
    if (!failureContractHolds(source) || !recoveryContractHolds(source)) {
      console.log(`PASS verify-predispatch-panel-mounted SELFTEST: ${name}`);
      caught += 1;
    } else {
      fail(`selftest mutation survived: ${name}`);
    }
  }
  if (caught !== mutations.length) fail(`selftest caught ${caught}/${mutations.length}`);
}

console.log("PASS verify-predispatch-panel-mounted");
