#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["drug_alcohol.list"],"task":"SAFETY-F6621-DRUG-POOL-CONFIRM-LIFECYCLE","vertical":"column-wave"} */
import fs from "node:fs";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from './lib/entity-multiselect-filter-contract.mjs';

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", "utf8");

function inspect(value) {
  const failures = [];
  failures.push(...multiSelectFilterProblems(value, { file: 'apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx', kind: 'driver', testId: 'drug-alcohol-filter-driver' }));
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing action generation"],
    // UPL-04 (e425f051e4, #19134) wrapped the create with a source-document upload and spreads the
    // snapshotted payload so source_doc_id rides along — still the immutable input snapshot, never
    // the live companyId/form state. Both the upload scope and the create must read input.*.
    [/createDrugProgramTest\(input\.companyId, \{ \.\.\.input\.payload, source_doc_id: sourceDocId \}\)/, "test create uses mutable company/form"],
    [/uploadSourceDocumentFromFile\(input\.file, \{[\s\S]*?operating_company_id: input\.companyId,[\s\S]*?entity_id: input\.driverId/, "test evidence upload uses mutable company/driver"],
    [/driver_id: effectiveDriverId[\s\S]*test_type: testType[\s\S]*result: testResult[\s\S]*test_date: testDate/, "test create does not snapshot driver/form"],
    [/bulkEnrollRandomPool\(input\.companyId, input\.consortiumName\)/, "bulk enrollment uses mutable company/name"],
    [/createRtdCase\(input\.companyId, \{ driver_id: input\.driverId \}\)/, "RTD open uses mutable company/driver"],
    [/advanceRtdCase\(input\.caseId, input\.companyId/, "RTD advance uses mutable case/company"],
    [/input\.generation !== actionGenerationRef\.current/g, "stale successes are not rejected"],
    [/actionGenerationRef\.current \+= 1[\s\S]*createTestMutation\.reset\(\)[\s\S]*bulkEnrollMutation\.reset\(\)[\s\S]*openRtdMutation\.reset\(\)[\s\S]*advanceRtdMutation\.reset\(\)/, "company/driver switch leaves stale actions"],
    [/createTestMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale test error can leak"],
    [/openRtdMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale RTD-open error can leak"],
    [/advanceRtdMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale RTD-advance error can leak"],
    [/<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{effectiveDriverId\}/, "selected-driver reverse drill is missing"],
    [/pendingBulkEnroll, setPendingBulkEnroll/, "bulk enrollment does not retain a submitted snapshot"],
    [/setPendingBulkEnroll\(\{[\s\S]*companyId,[\s\S]*generation: actionGenerationRef\.current,[\s\S]*consortiumName: name,[\s\S]*activeDriverCount,/, "bulk confirmation snapshot is incomplete"],
    [/onConfirm=\{async \(\) => \{[\s\S]*await bulkEnrollMutation\.mutateAsync\(\{[\s\S]*companyId: input\.companyId,[\s\S]*generation: input\.generation,[\s\S]*consortiumName: input\.consortiumName/, "bulk confirmation does not await its immutable snapshot"],
    [/<ConfirmModal[\s\S]*title="Enroll active drivers in this random pool\?"/, "bulk enrollment lacks canonical confirmation chrome"],
  ];
  if (/window\.confirm\(/.test(value)) failures.push("native confirmation still blocks bulk enrollment");
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 4)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  if (inspect(source).length) throw new Error(`baseline failed: ${inspect(source).join('; ')}`);
  const filterPlants = selftestMultiSelectFilterContract();
  const mutations = [
    "actionGenerationRef = useRef(0)",
    "createDrugProgramTest(input.companyId, { ...input.payload",
    "operating_company_id: input.companyId",
    "bulkEnrollRandomPool(input.companyId, input.consortiumName)",
    "createRtdCase(input.companyId, { driver_id: input.driverId })",
    "advanceRtdCase(input.caseId, input.companyId",
    "pendingBulkEnroll, setPendingBulkEnroll",
    "<ConfirmModal",
    "await bulkEnrollMutation.mutateAsync",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-drug-alcohol-action-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length}; multi-select plants ${filterPlants})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-drug-alcohol-action-company-lifecycle PASS — actions are company/driver stable with canonical linkage");
}
