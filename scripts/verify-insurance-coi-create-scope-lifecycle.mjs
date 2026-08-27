#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/customers/CoiTab.tsx";

function inspect(source) {
  const failures = [];
  const checks = [
    ["generation ref", /const createGenerationRef = useRef\(0\)/],
    ["immutable mutation input", /mutationFn: \(input: \{[\s\S]{0,220}companyId: string;[\s\S]{0,220}customerId: string;[\s\S]{0,220}generation: number;[\s\S]{0,260}payload: Omit<Parameters<typeof createInsuranceCoiRequest>\[0\]/],
    ["submitted company and customer own payload", /createInsuranceCoiRequest\(\{\s*\.\.\.input\.payload,\s*operating_company_id: input\.companyId,\s*customer_id: input\.customerId,/],
    ["submit snapshots scope", /createMutation\.mutate\(\{\s*companyId: operatingCompanyId,\s*customerId,\s*generation: createGenerationRef\.current,\s*payload:/],
    ["submitted scope owns refresh", /queryKey: \["insurance-coi-requests", input\.companyId, input\.customerId\]/],
    ["scope transition retires workflow", /useEffect\(\(\) => \{\s*createGenerationRef\.current \+= 1;\s*createMutation\.reset\(\);\s*resetCreateForm\(\);\s*\}, \[operatingCompanyId, customerId, variant\]\)/],
    ["pending close rejected", /function closeCreate\(\) \{\s*if \(createMutation\.isPending\) return;/],
    ["drawer uses guarded close", /<Modal variant="drawer"[^>]*onClose=\{closeCreate\}/],
    ["cancel uses guarded close", /onClick=\{closeCreate\} disabled=\{createMutation\.isPending\}/],
    ["compact toggle uses guarded close", /requestOpen \? closeCreate\(\) : setRequestOpen\(true\)/],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) failures.push(label);
  }
  const staleGuards = source.match(/input\.generation !== createGenerationRef\.current/g)?.length ?? 0;
  if (staleGuards !== 2) failures.push("success and error callbacks both reject stale scope");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const createGenerationRef = useRef(0);", "const createGenerationRef = { current: 0 };"),
    source.replace("companyId: string;\n      customerId: string;", "companyId: string;\n      customerId?: string;"),
    source.replace("operating_company_id: input.companyId,", "operating_company_id: operatingCompanyId!,"),
    source.replace("customer_id: input.customerId,", "customer_id: customerId,"),
    source.replace("customerId,\n      generation:", "customerId: \"\",\n      generation:"),
    source.replace("queryKey: [\"insurance-coi-requests\", input.companyId, input.customerId]", "queryKey: [\"insurance-coi-requests\", operatingCompanyId, customerId]"),
    source.replace("createMutation.reset();\n    resetCreateForm();", "// planted: scope transition keeps workflow"),
    source.replace("if (createMutation.isPending) return;", "// planted: pending creator can disappear"),
    source.replace("onClose={closeCreate}", "onClose={() => setRequestOpen(false)}"),
    source.replace("onClick={closeCreate} disabled={createMutation.isPending}", "onClick={() => setRequestOpen(false)}"),
    source.replace("requestOpen ? closeCreate() : setRequestOpen(true)", "setRequestOpen((open) => !open)"),
    source.replace("input.generation !== createGenerationRef.current", "false"),
  ];
  const survived = mutations
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => inspect(candidate).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-insurance-coi-create-scope-lifecycle --selftest: ${survived.length}/${mutations.length} planted defects survived (${survived.map(({ index }) => index + 1).join(", ")})`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-coi-create-scope-lifecycle --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-coi-create-scope-lifecycle: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-insurance-coi-create-scope-lifecycle");
