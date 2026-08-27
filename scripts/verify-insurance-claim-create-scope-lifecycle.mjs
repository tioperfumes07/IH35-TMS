#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/components/insurance/ClaimCreateModal.tsx";

function inspect(source) {
  const failures = [];
  const checks = [
    ["generation ref", /const lifecycleGenerationRef = useRef\(0\)/],
    ["immutable mutation input", /mutationFn: \(input: \{[\s\S]{0,220}companyId: string;[\s\S]{0,220}generation: number;[\s\S]{0,220}payload: Omit<Parameters<typeof insuranceClaimsApi\.create>\[0\], "operating_company_id">/],
    ["submitted company owns payload", /insuranceClaimsApi\.create\(\{ \.\.\.input\.payload, operating_company_id: input\.companyId \}\)/],
    ["submit snapshots company", /createMutation\.mutate\(\{\s*companyId: operatingCompanyId,\s*generation: lifecycleGenerationRef\.current,\s*payload:/],
    ["company transition retires workflow", /useEffect\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*createMutation\.reset\(\);[\s\S]{0,260}setSuggestionPinned\(false\);\s*\}, \[operatingCompanyId\]\)/],
    ["pending close rejected", /const closeModal = \(\) => \{\s*if \(createMutation\.isPending\) return;/],
    ["drawer uses guarded close", /<ParityDrawer open=\{open\} onClose=\{closeModal\}/],
    ["cancel uses guarded close", /onClick=\{closeModal\}\s*disabled=\{createMutation\.isPending\}/],
  ];
  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) failures.push(label);
  }
  const staleGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (staleGuards !== 2) failures.push("success and error callbacks both reject stale scope");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const lifecycleGenerationRef = useRef(0);", "const lifecycleGenerationRef = { current: 0 };"),
    source.replace("companyId: string;", "companyId?: string;"),
    source.replace("insuranceClaimsApi.create({ ...input.payload, operating_company_id: input.companyId })", "insuranceClaimsApi.create({ ...input.payload, operating_company_id: operatingCompanyId })"),
    source.replace("companyId: operatingCompanyId,", "companyId: \"\","),
    source.replace("createMutation.reset();", "// planted: mutation survives scope transition"),
    source.replace("if (createMutation.isPending) return;", "// planted: pending creator can disappear"),
    source.replace("onClose={closeModal}", "onClose={onClose}"),
    source.replace("onClick={closeModal}\n            disabled={createMutation.isPending}", "onClick={onClose}"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
  ];
  const survived = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-insurance-claim-create-scope-lifecycle --selftest: ${survived.length}/${mutations.length} planted defects survived`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-claim-create-scope-lifecycle --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-claim-create-scope-lifecycle: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-insurance-claim-create-scope-lifecycle");
