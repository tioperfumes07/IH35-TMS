#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/customers/CoiTab.tsx";

function inspect(source) {
  const failures = [];
  const checks = [
    ["generation ref", /const updateGenerationRef = useRef\(0\)/],
    ["immutable mutation input", /mutationFn: \(input: \{[\s\S]{0,220}id: string;[\s\S]{0,220}companyId: string;[\s\S]{0,220}customerId: string;[\s\S]{0,220}generation: number;[\s\S]{0,220}payload: Parameters<typeof updateInsuranceCoiRequest>\[2\]/],
    ["writer consumes submitted snapshot", /updateInsuranceCoiRequest\(input\.id, input\.companyId, input\.payload\)/],
    ["submit snapshots scope and record", /updateMutation\.mutate\(\{\s*id: request\.id,\s*companyId: operatingCompanyId,\s*customerId,\s*generation: updateGenerationRef\.current,\s*payload:/],
    ["scope transition retires edit", /useEffect\(\(\) => \{\s*updateGenerationRef\.current \+= 1;\s*updateMutation\.reset\(\);\s*setEditingId\(null\);\s*\}, \[operatingCompanyId, customerId, variant\]\)/],
    ["pending edit switch rejected", /function beginEdit\(request: InsuranceCoiRequest\) \{\s*if \(updateMutation\.isPending\) return;/],
    ["pending close rejected", /function closeUpdate\(\) \{\s*if \(updateMutation\.isPending\) return;/],
    ["cancel uses guarded close", /onClick=\{closeUpdate\} disabled=\{updateMutation\.isPending\}/],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) failures.push(label);
  }
  const submittedRefreshes = source.match(/queryKey: \["insurance-coi-requests", input\.companyId, input\.customerId\]/g)?.length ?? 0;
  if (submittedRefreshes !== 2) failures.push("both create and update refresh their submitted scope");
  const staleGuards = source.match(/input\.generation !== updateGenerationRef\.current/g)?.length ?? 0;
  if (staleGuards !== 2) failures.push("success and error callbacks both reject stale scope");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const updateGenerationRef = useRef(0);", "const updateGenerationRef = { current: 0 };"),
    source.replace("id: string;\n      companyId: string;", "id?: string;\n      companyId: string;"),
    source.replace("updateInsuranceCoiRequest(input.id, input.companyId, input.payload)", "updateInsuranceCoiRequest(input.id, operatingCompanyId!, input.payload)"),
    source.replace("id: request.id,\n      companyId:", "id: \"\",\n      companyId:"),
    source.replace("companyId: operatingCompanyId,\n      customerId,\n      generation: updateGenerationRef.current", "companyId: operatingCompanyId,\n      customerId: \"\",\n      generation: updateGenerationRef.current"),
    source.replace("queryKey: [\"insurance-coi-requests\", input.companyId, input.customerId]", "queryKey: [\"insurance-coi-requests\", operatingCompanyId, customerId]"),
    source.replace("updateMutation.reset();\n    setEditingId(null);", "// planted: scope transition keeps edit"),
    source.replace("if (updateMutation.isPending) return;\n    setEditingId(request.id);", "setEditingId(request.id);"),
    source.replace("if (updateMutation.isPending) return;\n    updateGenerationRef.current += 1;", "updateGenerationRef.current += 1;"),
    source.replace("onClick={closeUpdate} disabled={updateMutation.isPending}", "onClick={() => setEditingId(null)}"),
    source.replace("input.generation !== updateGenerationRef.current", "false"),
  ];
  const survived = mutations
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => inspect(candidate).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-insurance-coi-update-scope-lifecycle --selftest: ${survived.length}/${mutations.length} planted defects survived (${survived.map(({ index }) => index + 1).join(", ")})`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-coi-update-scope-lifecycle --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-coi-update-scope-lifecycle: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-insurance-coi-update-scope-lifecycle");
