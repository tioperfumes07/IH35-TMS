#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/CreateTrailerModal.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=fleet cols=trailer,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["mutation snapshots company and draft", /mutationFn: \(input: \{ companyId: string; generation: number; draft: typeof draft \}\)/],
  ["payload reads submitted draft", /equipment_number: input\.draft\.equipment_number\.trim\(\)[\s\S]*?equipment_type: input\.draft\.equipment_type/],
  ["lease scope uses submitted company", /currently_leased_to_company_id: input\.draft\.currently_leased_to_company_id \|\| input\.companyId/],
  ["created label uses submitted draft", /onCreated\?\.\(String\(created\.id\), input\.draft\.equipment_number\.trim\(\)\)/],
  ["stale success rejected", /input\.generation !== actionGenerationRef\.current/],
  ["stale success rejected before side effects", /onSuccess: async \(created, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return;\s*await queryClient\.invalidateQueries/],
  ["stale error rejected", /input\.generation === actionGenerationRef\.current/],
  ["transition increments generation", /actionGenerationRef\.current \+= 1/],
  ["transition resets mutation", /createMutation\.reset\(\)/],
  ["caller snapshots draft", /createMutation\.mutate\(\{ companyId: operatingCompanyId, generation: actionGenerationRef\.current, draft: \{ \.\.\.draft \} \}\)/],
  ["kind-specific types retained", /equipmentTypesForPickerKind[\s\S]*?equipmentKind === "chassis"[\s\S]*?return \["Chassis"\]/],
  ["company picker retained", /dataTestId="fleet-create-trailer-leased-to-company"/],
];
function failures(text) { return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label); }
const base = failures(source);
if (base.length) { console.error(`verify-create-trailer-company-lifecycle FAIL: ${base.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("input.draft.equipment_number.trim()", "draft.equipment_number.trim()"),
    source.replace("input.draft.currently_leased_to_company_id || input.companyId", "draft.currently_leased_to_company_id || operatingCompanyId"),
    source.replace("input.generation !== actionGenerationRef.current", "false"),
    source.replace("if (input.generation !== actionGenerationRef.current) return;\n      await queryClient.invalidateQueries", "await queryClient.invalidateQueries\n      if (input.generation !== actionGenerationRef.current) return;"),
    source.replace("draft: { ...draft }", "draft"),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) { console.error(`verify-create-trailer-company-lifecycle selftest FAIL: ${escaped}/6 mutations escaped`); process.exit(1); }
  console.log("verify-create-trailer-company-lifecycle selftest PASS — 6/6 planted defects detected");
  process.exit(0);
}
console.log("verify-create-trailer-company-lifecycle PASS — creator preserves submitted company/draft/kind and human label across transitions");
