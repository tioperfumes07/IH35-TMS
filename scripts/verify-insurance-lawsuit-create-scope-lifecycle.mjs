#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx";
function inspect(source) {
  const failures = [];
  const checks = [
    ["generation ref", /const lifecycleGenerationRef = useRef\(0\)/],
    ["immutable input", /mutationFn: \(input: \{[\s\S]{0,220}companyId: string;[\s\S]{0,220}generation: number;[\s\S]{0,220}payload: Omit<Parameters<typeof insuranceLawsuitsApi\.create>\[0\], "operating_company_id">/],
    ["submitted company", /insuranceLawsuitsApi\.create\(\{ \.\.\.input\.payload, operating_company_id: input\.companyId \}\)/],
    ["submit snapshot", /createMutation\.mutate\(\{\s*companyId: operatingCompanyId,\s*generation: lifecycleGenerationRef\.current,\s*payload:/],
    ["company retirement", /useEffect\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*createMutation\.reset\(\);[\s\S]{0,240}setServerError\(""\);\s*\}, \[operatingCompanyId\]\)/],
    ["pending close", /const closeModal = \(\) => \{\s*if \(createMutation\.isPending\) return;/],
    ["drawer guarded", /<ParityDrawer open=\{open\} onClose=\{closeModal\}/],
    ["cancel guarded", /onClick=\{closeModal\}\s*disabled=\{createMutation\.isPending\}/],
  ];
  for (const [label, pattern] of checks) if (!pattern.test(source)) failures.push(label);
  if ((source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0) !== 2) failures.push("both callbacks reject stale scope");
  return failures;
}
const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const lifecycleGenerationRef = useRef(0);", "const lifecycleGenerationRef = { current: 0 };"),
    source.replace("companyId: string;", "companyId?: string;"),
    source.replace("insuranceLawsuitsApi.create({ ...input.payload, operating_company_id: input.companyId })", "insuranceLawsuitsApi.create({ ...input.payload, operating_company_id: operatingCompanyId })"),
    source.replace("companyId: operatingCompanyId,", "companyId: \"\","),
    source.replace("createMutation.reset();", "// planted: stale mutation survives"),
    source.replace("if (createMutation.isPending) return;", "// planted: pending close allowed"),
    source.replace("onClose={closeModal}", "onClose={onClose}"),
    source.replace("onClick={closeModal}\n            disabled={createMutation.isPending}", "onClick={onClose}"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
  ];
  const survived = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-insurance-lawsuit-create-scope-lifecycle --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-insurance-lawsuit-create-scope-lifecycle --selftest (${mutations.length} mutations killed)`);
  process.exit(0);
}
const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-insurance-lawsuit-create-scope-lifecycle: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-insurance-lawsuit-create-scope-lifecycle");
