#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["connectivity","qbo_chrome"],"leaves":["type_catalog.list","type_catalog.create"],"task":"INSURANCE-F6627-TYPE-CATALOG-ACTION-SCOPE","vertical":"column-wave"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing company action generation"],
    [/const refresh = async \(submittedCompanyId: string\)/, "refresh closes over current company"],
    [/createInsuranceTypeCatalog\(input\.payload\)/, "create does not submit immutable payload"],
    [/updateInsuranceTypeCatalog\(input\.payload\.id, input\.companyId/, "update closes over current company"],
    [/deactivateInsuranceTypeCatalog\(input\.id, input\.companyId\)/, "deactivate closes over current company"],
    [/actionGenerationRef\.current \+= 1;[\s\S]*setEditingId\(null\);[\s\S]*createMutation\.reset\(\);[\s\S]*updateMutation\.reset\(\);[\s\S]*deactivateMutation\.reset\(\);[\s\S]*\}, \[companyId\]\)/, "company switch retains catalog actions or drafts"],
    [/(?:input\.generation !== actionGenerationRef\.current|input\.generation === actionGenerationRef\.current)/g, "stale callbacks are not gated"],
    [/createMutation\.mutate\(\{\s*companyId,\s*generation: actionGenerationRef\.current,\s*payload: \{\s*operating_company_id: companyId,/, "create intent does not bind company and generation"],
  ];
  for (const [pattern, message] of checks) {
    const match = value.match(pattern);
    if (!match || (message === "stale callbacks are not gated" && match.length < 6)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "actionGenerationRef = useRef(0)",
    "refresh = async (submittedCompanyId: string)",
    "createInsuranceTypeCatalog(input.payload)",
    "input.payload.id, input.companyId",
    "input.id, input.companyId",
    "actionGenerationRef.current += 1;",
    "input.generation !== actionGenerationRef.current",
    "createMutation.mutate({\n                  companyId,\n                  generation: actionGenerationRef.current,",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.replace(token, "REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-insurance-type-catalog-action-scope selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-insurance-type-catalog-action-scope FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-insurance-type-catalog-action-scope PASS — create/update/deactivate bind immutable company and generation");
