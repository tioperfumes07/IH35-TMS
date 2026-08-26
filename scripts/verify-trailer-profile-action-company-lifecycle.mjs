#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=fleet cols=driver,trailer,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["archive snapshots trailer and company", /equipment\/\$\{input\.trailerId\}\/deactivate\?operating_company_id=\$\{encodeURIComponent\(input\.companyId\)\}/],
  ["archive caller snapshots generation", /archiveMutation\.mutateAsync\(\{ trailerId: id, companyId, generation: actionGenerationRef\.current \}\)/],
  ["archive stale rejection", /onSuccess: \(_data, input\) => \{[\s\S]*?input\.generation !== actionGenerationRef\.current/],
  ["quick assign snapshots all FKs", /const input = \{ companyId, trailerId: id, driverId, generation: actionGenerationRef\.current \}/],
  ["quick assign submits snapshots", /operating_company_id: input\.companyId[\s\S]*?equipment_id: input\.trailerId[\s\S]*?driver_id: input\.driverId/],
  ["quick assign stale rejection", /quicksaveEquipmentAssignment[\s\S]*?input\.generation !== actionGenerationRef\.current/],
  ["exact profile invalidation", /invalidateProfile\(input\.trailerId, input\.companyId\)/],
  ["context transition increments generation", /actionGenerationRef\.current \+= 1/],
  ["context transition closes actions", /archiveMutation\.reset\(\);[\s\S]*?setArchiveConfirmOpen\(false\)[\s\S]*?setQuickAssignOpen\(false\)/],
  ["load reverse drills retained", /kind="load"[\s\S]*?id=\{load\.load_id/],
  ["safety reverse retained", /<AssetSafetyReverseSection[\s\S]*?assetKind="trailer"[\s\S]*?assetId=\{id\}/],
];
function failures(text) { return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label); }
const base = failures(source);
if (base.length) { console.error(`verify-trailer-profile-action-company-lifecycle FAIL: ${base.join(", ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("input.trailerId}/deactivate", "id}/deactivate"),
    source.replace("encodeURIComponent(input.companyId)", "encodeURIComponent(companyId)"),
    source.replaceAll("input.generation !== actionGenerationRef.current", "false"),
    source.replace("driver_id: input.driverId", "driver_id: driverId"),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) { console.error(`verify-trailer-profile-action-company-lifecycle selftest FAIL: ${escaped}/5 mutations escaped`); process.exit(1); }
  console.log("verify-trailer-profile-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}
console.log("verify-trailer-profile-action-company-lifecycle PASS — archive/quick-assign preserve company-trailer-driver lifecycle and reverse mounts");
