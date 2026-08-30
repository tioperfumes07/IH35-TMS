#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","load","connectivity","qbo_chrome","reverse_link"],"leaves":["fines.list","safety.modal.fine_create"],"task":"CLASS-F6527-SAFETY-FINE-CREATE-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const file = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const source = fs.readFileSync(file, "utf8");

const resetTokens = [
  'setSubjectType("driver")', "setSubjectDriverId(null)", 'setIssuedByAuthority("DOT")', 'setJurisdiction("")',
  "setCivilFineTypeId(null)", 'setViolationDescription("")', "setIssuedDate(companyToday())", 'setAmountUsd("")',
  'setNotes("")', "setSourceDocFile(null)", 'setCivilFineTypeSearch("")', "setRelatedLoadId(null)",
  "setRelatedUnitId(null)", "setSuggestionPinned(false)",
];

function failures(input = source) {
  const reset = input.match(/const resetDraft = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/)?.[1] ?? "";
  const missingReset = resetTokens.filter((token) => !reset.includes(token));
  return [
    ["complete fine draft reset", missingReset.length === 0],
    ["open/company transition resets draft and mutation", /lifecycleGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*createMutation\.reset\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(input)],
    ["accepted close resets lifecycle", /const completeClose = useCallback\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*resetDraft\(\);\s*createMutation\.reset\(\);\s*onClose\(\);/.test(input)],
    ["pending create cannot be dismissed", /const handleClose = useCallback\(\(\) => \{\s*if \(createMutation\.isPending\) return;\s*completeClose\(\);/.test(input)],
    ["dirty drawer safely registers one confirmation boundary", input.includes("confirmDiscardOnClose") && input.includes("isDirty={isDirty}") && input.includes("onRegisterAttemptClose={(next) => setAttemptClose(() => next)}") && /onClick=\{attemptClose\} disabled=\{createMutation\.isPending\}/.test(input)],
    ["dirty predicate covers full fine intent", /const isDirty =[\s\S]*subjectType !== "driver"[\s\S]*subjectDriverId[\s\S]*issuedByAuthority !== "DOT"[\s\S]*jurisdiction\.trim\(\) \|\| civilFineTypeId \|\| violationDescription\.trim\(\)[\s\S]*issuedDate !== companyToday\(\)[\s\S]*amountUsd\.trim\(\) \|\| notes\.trim\(\) \|\| sourceDocFile \|\| civilFineTypeSearch\.trim\(\)[\s\S]*relatedLoadId \|\| relatedUnitId/.test(input)],
    ["submit snapshots complete fine intent", /createMutation\.mutate\(\{\s*companyId: operatingCompanyId,\s*generation: lifecycleGenerationRef\.current,[\s\S]*?civilFineTypeId,[\s\S]*?violationCode:[\s\S]*?sourceDocFile,[\s\S]*?relatedLoadId,\s*relatedUnitId,/.test(input)],
    ["stale success cannot close new context", /onSuccess: \(_created, input\) => \{\s*if \(lifecycleGenerationRef\.current !== input\.generation\) return;\s*onCreated\(\);\s*completeClose\(\);/.test(input)],
    ["stale rejection cannot paint new context", /createMutation\.isError && createMutation\.variables\?\.generation === lifecycleGenerationRef\.current/.test(input)],
    ["document upload uses submitted scope and links", /uploadSourceDoc = async \(input: FineSubmission\)[\s\S]*?operating_company_id: input\.companyId[\s\S]*?input\.subjectDriverId[\s\S]*?input\.relatedUnitId[\s\S]*?input\.relatedLoadId/.test(input)],
    ["canonical scoped fine linkage remains", /createSafetyFine\(input\.companyId, \{[\s\S]*?subject_driver_id:[\s\S]*?civil_fine_type_id:[\s\S]*?related_load_id:[\s\S]*?related_unit_id:[\s\S]*?source_doc_id:/.test(input)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const staleFile = source.replace("setSourceDocFile(null);", "void sourceDocFile;");
  const staleCompany = source.replace("[open, operatingCompanyId, resetDraft]", "[open, resetDraft]");
  const mutableCompany = source.replace("createSafetyFine(input.companyId", "createSafetyFine(operatingCompanyId");
  const mutableFile = source.replace("operating_company_id: input.companyId || undefined", "operating_company_id: operatingCompanyId || undefined");
  const staleSuccess = source.replace("if (lifecycleGenerationRef.current !== input.generation) return;", "void input.generation;");
  const staleError = source.replaceAll("createMutation.isError && createMutation.variables?.generation === lifecycleGenerationRef.current", "createMutation.isError");
  const pendingDismiss = source.replace("if (createMutation.isPending) return;", "void createMutation.isPending;");
  const noConfirm = source.replace("confirmDiscardOnClose", "");
  const rawCancel = source.replace("onClick={attemptClose} disabled={createMutation.isPending}", "onClick={handleClose}");
  const incompleteDirty = source.replace("|| Boolean(relatedLoadId || relatedUnitId)", "");
  const checks = [
    failures(staleFile).includes("complete fine draft reset"),
    failures(staleCompany).includes("open/company transition resets draft and mutation"),
    failures(mutableCompany).includes("canonical scoped fine linkage remains"),
    failures(mutableFile).includes("document upload uses submitted scope and links"),
    failures(staleSuccess).includes("stale success cannot close new context"),
    failures(staleError).includes("stale rejection cannot paint new context"),
    failures(pendingDismiss).includes("pending create cannot be dismissed"),
    failures(noConfirm).includes("dirty drawer safely registers one confirmation boundary"),
    failures(rawCancel).includes("dirty drawer safely registers one confirmation boundary"),
    failures(incompleteDirty).includes("dirty predicate covers full fine intent"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-safety-fine-create-lifecycle selftest PASS — 10/10 lifecycle mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-safety-fine-create-lifecycle FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-safety-fine-create-lifecycle PASS — complete fine draft is isolated per company/open lifecycle");
