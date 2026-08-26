#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=fleet cols=driver,unit,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["availability snapshots scope", /postQuickAvailability\(input\.unitId, input\.companyId, input\.value\)/],
  ["availability caller snapshots generation", /quickAvailMutation\.mutate\(\{ unitId: id, companyId, generation: actionGenerationRef\.current, value \}\)/],
  ["archive snapshots scope", /units\/\$\{input\.unitId\}\/deactivate\?operating_company_id=\$\{encodeURIComponent\(input\.companyId\)\}/],
  ["archive caller snapshots generation", /archiveMutation\.mutateAsync\(\{ unitId: id, companyId, generation: actionGenerationRef\.current \}\)/],
  ["quick assign snapshots all FKs", /const input = \{ unitId: id, companyId, driverId, generation: actionGenerationRef\.current \}/],
  ["quick assign submits snapshots", /operating_company_id: input\.companyId[\s\S]*?equipment_id: input\.unitId[\s\S]*?driver_id: input\.driverId/],
  ["stale callbacks rejected", /input\.generation !== actionGenerationRef\.current/],
  ["exact submitting profile invalidation", /\["unit-profile", input\.unitId, input\.companyId\]/],
  ["transition invalidates generation", /actionGenerationRef\.current \+= 1/],
  ["transition resets native actions", /quickAvailMutation\.reset\(\);[\s\S]*?archiveMutation\.reset\(\);[\s\S]*?setQuickAssignOpen\(false\)/],
  ["safety reverse retained", /<AssetSafetyReverseSection[\s\S]*?assetKind="unit"[\s\S]*?assetId=\{id\}/],
  ["driver reverse retained", /<UnitDefaultDriversReverseSection[\s\S]*?unitId=\{id\}/],
];
function failures(text) { return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label); }
const base = failures(source);
if (base.length) { console.error(`verify-unit-profile-action-company-lifecycle FAIL: ${base.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("postQuickAvailability(input.unitId, input.companyId, input.value)", "postQuickAvailability(id, companyId, input.value)"),
    source.replace("input.unitId}/deactivate", "id}/deactivate"),
    source.replaceAll("input.generation !== actionGenerationRef.current", "false"),
    source.replace("driver_id: input.driverId", "driver_id: driverId"),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) { console.error(`verify-unit-profile-action-company-lifecycle selftest FAIL: ${escaped}/5 mutations escaped`); process.exit(1); }
  console.log("verify-unit-profile-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}
console.log("verify-unit-profile-action-company-lifecycle PASS — availability/archive/quick-assign preserve company-unit-driver lifecycle and reverse mounts");
