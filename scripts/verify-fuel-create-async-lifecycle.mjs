#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["driver","unit","trailer","vendor","load","connectivity","qbo_chrome","reverse_link"],"leaves":["fuel.modal.create_fuel_transaction"],"task":"CLASS-F6526-FUEL-CREATE-ASYNC-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx";
const source = fs.readFileSync(file, "utf8");
const DIRTY_CLOSE_FAILURE = "drawer and Cancel safely register shared dirty-confirmation boundary";

// LEAD 443.187 — REPOINTED, same rule ("the dirty predicate covers the complete Fuel intent"): gallons and price per gallon
// became numeric inputs (number | null; 8a20962fb2 QTY-DEC-ALL "NumberInput + fuel/cost/WO qty accept typed decimals"), so the predicate reads `gallons != null || pricePerGallon != null` instead of the
// old `.trim()` strings. Either form satisfies the rule; dropping either field still fails (selftest plant added).
function failures(input = source) {
  return [
    ["lifecycle generation advances per open/company", /lifecycleGenerationRef\.current \+= 1;\s*setSaving\(false\);\s*if \(!open\) return;\s*resetDraft\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(input)],
    ["completed lifecycle retires request and resets full draft", /const completeClose = useCallback\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*setSaving\(false\);\s*resetDraft\(\);\s*onClose\(\);/.test(input)],
    ["pending create cannot be dismissed", /const handleClose = useCallback\(\(\) => \{\s*if \(saving\) return;\s*completeClose\(\);\s*\}, \[completeClose, saving\]\);/.test(input)],
    [DIRTY_CLOSE_FAILURE, /<Modal open=\{open(?: && !assignmentQuestion)?\} onClose=\{handleClose\}[^>]*confirmDiscardOnClose[^>]*isDirty=\{isDirty\}[^>]*onRegisterAttemptClose=\{\(next\) => setAttemptClose\(\(\) => next\)\}[\s\S]*?<Button size="sm" variant="secondary" onClick=\{attemptClose\} disabled=\{saving\}>/.test(input)],
    ["dirty predicate covers complete Fuel intent", /const isDirty = transactionDate !== companyToday\(\)[\s\S]*driverId \|\| unitId \|\| trailerId \|\| vendorId \|\| loadId[\s\S]*loadExemptionReason\.trim\(\)[\s\S]*fuelType !== "diesel"[\s\S]*(?:gallons\.trim\(\) \|\| pricePerGallon\.trim\(\)|gallons != null\s*\|\| pricePerGallon != null)[\s\S]*totalCost != null[\s\S]*locationCity\.trim\(\) \|\| locationState\.trim\(\) \|\| notes\.trim\(\)/.test(input)],
    ["submit captures lifecycle generation", /const submissionGeneration = lifecycleGenerationRef\.current;\s*setSaving\(true\);/.test(input)],
    // 443.290: after the 443.243 assignment evaluation (an await) the generation is checked AGAIN before the popup or the
    // close — a stale success never opens a question over, or closes, the next drawer.
    ["stale success cannot toast, select, or close", /if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*pushToast\("Fuel purchase recorded", "success"\);\s*onCreated\(\);[\s\S]{0,320}?await evaluateFuelAssignmentOrNull\([^)]*\)[\s\S]{0,40}?;\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*if \(question\) \{\s*setAssignmentQuestion\(question\);\s*return;\s*\}\s*completeClose\(\);/.test(input)],
    ["stale rejection cannot paint the next drawer", /catch \(error\) \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;\s*pushToast\(userFacingApiError\(error, "Failed to record fuel purchase"\), "error"\);/.test(input)],
    ["stale request cannot clear current saving state", /finally \{\s*if \(lifecycleGenerationRef\.current === submissionGeneration\) setSaving\(false\);/.test(input)],
    ["canonical scoped writer and linkage remain", /createFuelTransaction\(operatingCompanyId, \{[\s\S]*?driver_id: driverId \|\| null,[\s\S]*?unit_id: unitId \|\| null,[\s\S]*?trailer_id: trailerId \|\| null,[\s\S]*?vendor_id: vendorId \|\| null,[\s\S]*?load_id: loadId \|\| null,/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleContext = source.replace("[open, operatingCompanyId, resetDraft]", "[open, resetDraft]");
  const staleDismiss = source.replace("lifecycleGenerationRef.current += 1;\n    setSaving(false);\n    resetDraft();\n    onClose();", "setSaving(false);\n    resetDraft();\n    onClose();");
  const pendingDismiss = source.replace("if (saving) return;", "void saving;");
  const rawDrawerClose = source.replace("confirmDiscardOnClose", "");
  const rawCancel = source.replace("onClick={attemptClose} disabled={saving}", "onClick={handleClose}");
  // 443.290: the drawer may step aside for the 443.243 assignment popup, but never lose its dismiss handler.
  const rawDrawerHandler = source.replace("open={open && !assignmentQuestion} onClose={handleClose}", "open={open && !assignmentQuestion} onClose={onClose}");
  const incompleteDirty = source.replace("|| Boolean(loadExemptionReason.trim())", "");
  const noGallonsDirty = source.replace(/\n\s*\|\| gallons != null/, "");
  const staleSuccess = source.replace("if (lifecycleGenerationRef.current !== submissionGeneration) return;", "void submissionGeneration;");
  const staleAfterEvaluate = source.replace(/(: null;\s*)if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;/, "$1void submissionGeneration;");
  const staleError = source.replace(/catch \(error\) \{\s*if \(lifecycleGenerationRef\.current !== submissionGeneration\) return;/, "catch (error) {");
  const staleFinally = source.replace("if (lifecycleGenerationRef.current === submissionGeneration) setSaving(false);", "setSaving(false);");
  const checks = [
    failures(staleContext).includes("lifecycle generation advances per open/company"),
    failures(staleDismiss).includes("completed lifecycle retires request and resets full draft"),
    failures(pendingDismiss).includes("pending create cannot be dismissed"),
    failures(rawDrawerClose).includes(DIRTY_CLOSE_FAILURE),
    failures(rawCancel).includes(DIRTY_CLOSE_FAILURE),
    failures(rawDrawerHandler).includes(DIRTY_CLOSE_FAILURE),
    failures(incompleteDirty).includes("dirty predicate covers complete Fuel intent"),
    failures(noGallonsDirty).includes("dirty predicate covers complete Fuel intent"),
    failures(staleSuccess).includes("stale success cannot toast, select, or close"),
    staleAfterEvaluate !== source && failures(staleAfterEvaluate).includes("stale success cannot toast, select, or close"),
    failures(staleError).includes("stale rejection cannot paint the next drawer"),
    failures(staleFinally).includes("stale request cannot clear current saving state"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-fuel-create-async-lifecycle selftest PASS — 12/12 lifecycle mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-fuel-create-async-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-fuel-create-async-lifecycle PASS — stale create cannot close or mutate a new drawer context");
