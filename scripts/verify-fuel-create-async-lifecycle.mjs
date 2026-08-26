#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["driver","unit","trailer","vendor","load","connectivity","qbo_chrome","reverse_link"],"leaves":["fuel.modal.create_fuel_transaction"],"task":"CLASS-F6526-FUEL-CREATE-ASYNC-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx";
const source = fs.readFileSync(file, "utf8");

function failures(input = source) {
  return [
    ["lifecycle generation advances per open/company", /lifecycleGenerationRef\.current \+= 1;\s*setSaving\(false\);\s*if \(!open\) return;\s*resetDraft\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(input)],
    ["dismiss immediately retires request and resets full draft", /const handleClose = useCallback\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*setSaving\(false\);\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["drawer X and Cancel share lifecycle close", /<Modal open=\{open\} onClose=\{handleClose\}[\s\S]*?<Button size="sm" variant="secondary" onClick=\{handleClose\}>/.test(input)],
    ["submit captures lifecycle generation", /const submissionGeneration = lifecycleGenerationRef\.current;\s*setSaving\(true\);/.test(input)],
    ["stale success cannot toast, select, or close", /if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*pushToast\("Fuel purchase recorded", "success"\);\s*onCreated\(\);\s*handleClose\(\);/.test(input)],
    ["stale rejection cannot paint the next drawer", /catch \(error\) \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*pushToast\(userFacingApiError\(error, "Failed to record fuel purchase"\), "error"\);/.test(input)],
    ["stale request cannot clear current saving state", /finally \{\s*if \(lifecycleGenerationRef\.current === submissionGeneration\) setSaving\(false\);/.test(input)],
    ["canonical scoped writer and linkage remain", /createFuelTransaction\(operatingCompanyId, \{[\s\S]*?driver_id: driverId \|\| null,[\s\S]*?unit_id: unitId \|\| null,[\s\S]*?trailer_id: trailerId \|\| null,[\s\S]*?vendor_id: vendorId \|\| null,[\s\S]*?load_id: loadId \|\| null,/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleContext = source.replace("[open, operatingCompanyId, resetDraft]", "[open, resetDraft]");
  const staleDismiss = source.replace("lifecycleGenerationRef.current += 1;\n    setSaving(false);\n    resetDraft();\n    onClose();", "setSaving(false);\n    resetDraft();\n    onClose();");
  const rawDrawerClose = source.replaceAll("onClose={handleClose}", "onClose={onClose}").replace("onClick={handleClose}", "onClick={onClose}");
  const staleSuccess = source.replace("if (lifecycleGenerationRef.current !== submissionGeneration) return;", "void submissionGeneration;");
  const staleError = source.replace(/catch \(error\) \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;/, "catch (error) {");
  const staleFinally = source.replace("if (lifecycleGenerationRef.current === submissionGeneration) setSaving(false);", "setSaving(false);");
  const checks = [
    failures(staleContext).includes("lifecycle generation advances per open/company"),
    failures(staleDismiss).includes("dismiss immediately retires request and resets full draft"),
    failures(rawDrawerClose).includes("drawer X and Cancel share lifecycle close"),
    failures(staleSuccess).includes("stale success cannot toast, select, or close"),
    failures(staleError).includes("stale rejection cannot paint the next drawer"),
    failures(staleFinally).includes("stale request cannot clear current saving state"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-fuel-create-async-lifecycle selftest PASS — 6/6 stale-request mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fuel-create-async-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fuel-create-async-lifecycle PASS — stale create cannot close or mutate a new drawer context");
