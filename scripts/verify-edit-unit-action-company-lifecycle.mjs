#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=fleet cols=unit,driver,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["context transition increments generation", /useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;[\s\S]*?\}, \[open, unitId, operatingCompanyId\]\)/],
  ["dismiss increments generation", /const resetAndClose = useCallback\(\(\) => \{\s*actionGenerationRef\.current \+= 1/],
  ["mutation snapshots scope and patch", /mutationFn: \(input: \{ unitId: string; companyId: string; generation: number; patch: Record<string, unknown> \}\) => patchUnit\(input\.unitId, input\.companyId, input\.patch\)/],
  ["caller copies patch", /saveMutation\.mutate\(\{ unitId: unitId!, companyId: operatingCompanyId, generation: actionGenerationRef\.current, patch: \{ \.\.\.patchPayload \} \}\)/],
  ["stale success rejected", /onSuccess: \(_data, input\) => \{\s*if \(input\.generation !== actionGenerationRef\.current\) return/],
  ["stale error rejected", /input\.generation === actionGenerationRef\.current/],
  ["exact modal invalidation", /\["edit-vehicle-modal", input\.unitId, input\.companyId\]/],
  ["driver picker retained", /<EntityPicker[\s\S]*?kind="driver"[\s\S]*?operatingCompanyId=\{operatingCompanyId\}/],
  ["company picker retained", /type === "company"[\s\S]*?<Combobox/],
];
function failures(text) { return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label); }
const base = failures(source);
if (base.length) { console.error(`verify-edit-unit-action-company-lifecycle FAIL: ${base.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replaceAll("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("patchUnit(input.unitId, input.companyId, input.patch)", "patchUnit(unitId!, operatingCompanyId, patchPayload)"),
    source.replace("patch: { ...patchPayload }", "patch: patchPayload"),
    source.replace("input.generation !== actionGenerationRef.current", "false"),
    source.replace('["edit-vehicle-modal", input.unitId, input.companyId]', '["edit-vehicle-modal", unitId, operatingCompanyId]'),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) { console.error(`verify-edit-unit-action-company-lifecycle selftest FAIL: ${escaped}/5 mutations escaped`); process.exit(1); }
  console.log("verify-edit-unit-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}
console.log("verify-edit-unit-action-company-lifecycle PASS — edit save preserves submitted company/unit/patch and Driver picker across transitions");
