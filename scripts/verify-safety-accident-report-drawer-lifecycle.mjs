#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","trailer","vendor","load","connectivity","reverse_link","qbo_chrome"],"leaves":["accidents.create","accidents.drawer.detail"],"task":"SAFETY-F6680-ACCIDENT-REPORT-DRAWER-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const source = fs.readFileSync(file, "utf8");

const resetTokens = [
  "setDriverId(initialDriverId)", "setUnitId(initialUnitId)", "setTrailerId(initialTrailerId)",
  "setVendorId(initialVendorId)", "setLoadId(initialLoadId)", "setIncidentDate(initialIncidentDate)",
  "setMemo(initialMemo)", "setAtFault(initialAtFault)", "setPreventable(initialPreventable)",
  "setPoliceReportNumber(initialPoliceReportNumber)", "setInsuranceClaimNumber(initialInsuranceClaimNumber)",
  "setLocation(initialLocation)", "setThirdPartyName(initialThirdPartyName)",
  "setThirdPartyPlate(initialThirdPartyPlate)", "setVendorInvoiceNumber(initialVendorInvoiceNumber)",
  "setBillOrExpenseRef(initialBillOrExpenseRef)", "setReportDate(initialReportDate)",
  "setRecordType(initialRecordType)", "setAccidentTypeId(initialAccidentTypeId)",
  "setServiceType(initialServiceType)", "setCostLines([])", "setTaxRate(8.25)",
  "setSaving(false)", "setUploading(false)", "setActionPending(false)",
  "setSuggestionPinned(false)", "lifecycleGenerationRef.current += 1",
];

function failures(input = source) {
  const resetEffect = input.match(/useEffect\(\(\) => \{\s*setDriverId\(initialDriverId\)([\s\S]*?)\n  \}, \[open, operatingCompanyId, createMode, accidentId,[\s\S]*?\]\);/)?.[0] ?? "";
  const missingReset = resetTokens.filter((token) => !resetEffect.includes(token));
  return [
    ["complete draft resets on open/company/record/mode transition", missingReset.length === 0],
    ["one guarded dirty-close boundary", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}") && input.includes("onRegisterAttemptClose={setAttemptClose}") && input.includes("onClick={attemptClose}")],
    ["every pending mutation locks dismissal", /const isBusy = saving \|\| uploading \|\| actionPending;[\s\S]*?if \(isBusy\) return;[\s\S]*?disabled=\{isBusy\}[\s\S]*?disabled=\{!canMutate \|\| isBusy\}/.test(input)],
    ["dirty predicate covers links evidence classification and costs", /const isDirty = driverId !== initialDriverId[\s\S]*?unitId !== initialUnitId[\s\S]*?trailerId !== initialTrailerId[\s\S]*?vendorId !== initialVendorId[\s\S]*?loadId !== initialLoadId[\s\S]*?policeReportNumber !== initialPoliceReportNumber[\s\S]*?insuranceClaimNumber !== initialInsuranceClaimNumber[\s\S]*?recordType !== initialRecordType[\s\S]*?accidentTypeId !== initialAccidentTypeId[\s\S]*?serviceType !== initialServiceType[\s\S]*?costLines\.length > 0[\s\S]*?taxRate !== 8\.25/.test(input)],
    ["save snapshots scope target mode and nested costs", /const generation = lifecycleGenerationRef\.current;\s*const companyId = operatingCompanyId;\s*const targetId = id;\s*const creating = createMode;\s*const payload = \{[\s\S]*?cost_lines: linkPayload\.cost_lines\.map\(\(line\) => \(\{ \.\.\.line \}\)\)/.test(input)],
    ["stale save completion is inert", /\.then\(\(\) => \{\s*if \(lifecycleGenerationRef\.current !== generation\) return;[\s\S]*?completeClose\(\);[\s\S]*?\.catch\(\(error\) => \{\s*if \(lifecycleGenerationRef\.current !== generation\) return;/.test(input)],
    ["liability action snapshots scope and rejects stale completion", /const spawnLiability = \(\) => \{[\s\S]*?const generation = lifecycleGenerationRef\.current;[\s\S]*?spawnSafetyLiability\(targetId, companyId\)[\s\S]*?if \(lifecycleGenerationRef\.current !== generation\) return;/.test(input)],
    ["work-order action snapshots scope and rejects stale completion", /const spawnWorkOrder = \(\) => \{[\s\S]*?const generation = lifecycleGenerationRef\.current;[\s\S]*?spawnSafetyWo\(targetId, companyId\)[\s\S]*?if \(lifecycleGenerationRef\.current !== generation\) return;/.test(input)],
    ["photo action snapshots scope and rejects stale completion", /const uploadPhoto = \(file: File\) => \{[\s\S]*?const generation = lifecycleGenerationRef\.current;[\s\S]*?addAccidentPhoto\(targetId, companyId, file\)[\s\S]*?if \(lifecycleGenerationRef\.current !== generation\) return;/.test(input)],
    ["canonical linked accident payload remains complete", /const linkPayload = \{[\s\S]*?accident_type_id:[\s\S]*?driver_id:[\s\S]*?unit_id:[\s\S]*?trailer_id:[\s\S]*?vendor_id:[\s\S]*?load_id:[\s\S]*?cost_lines:/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("setThirdPartyPlate(initialThirdPartyPlate);", "void initialThirdPartyPlate;"),
    source.replace("confirmDiscardOnClose", ""),
    source.replace("saving || uploading || actionPending", "saving || uploading"),
    source.replace("|| vendorId !== initialVendorId", ""),
    source.replace("const companyId = operatingCompanyId;", "const companyId = '';"),
    source.replace("if (lifecycleGenerationRef.current !== generation) return;", "void generation;"),
    source.replace("spawnSafetyLiability(targetId, companyId)", "spawnSafetyLiability(id, operatingCompanyId)"),
    source.replace("spawnSafetyWo(targetId, companyId)", "spawnSafetyWo(id, operatingCompanyId)"),
    source.replace("addAccidentPhoto(targetId, companyId, file)", "addAccidentPhoto(id, operatingCompanyId, file)"),
    source.replace("trailer_id: trailerId || null,", ""),
  ];
  const checks = mutations.map((mutation) => failures(mutation).length > 0);
  if (checks.some((ok) => !ok)) {
    console.error(`verify-safety-accident-report-drawer-lifecycle selftest FAIL — ${checks.filter(Boolean).length}/${checks.length} mutations red`);
    process.exit(1);
  }
  console.log(`verify-safety-accident-report-drawer-lifecycle selftest PASS — ${checks.length}/${checks.length} lifecycle mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-safety-accident-report-drawer-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-accident-report-drawer-lifecycle PASS — accident save, spawn, photo, and complete linked draft stay isolated per company/record lifecycle");
