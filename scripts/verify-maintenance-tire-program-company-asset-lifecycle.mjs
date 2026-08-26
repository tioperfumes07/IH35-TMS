#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["unit","trailer","connectivity","reverse_link"],"leaves":["tires.create_record","tires.create_brand","tire.profile.rotate","tire.profile.replace","tire.profile.tread_audit"],"task":"MAINT-F6606-TIRE-COMPANY-ASSET-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/TireProgramPage.tsx";
const source = fs.readFileSync(path, "utf8");
const checks = [
  [/type TireActionScope = \{[\s\S]*companyId: string;[\s\S]*assetKind: "unit" \| "trailer";[\s\S]*assetId: string;[\s\S]*generation: number;/, "shared company/asset scope is explicit"],
  [/const actionGenerationRef = useRef\(0\)/, "shared action generation exists"],
  [/const refresh = async \(scope: Pick<TireActionScope, "companyId" \| "assetKind" \| "assetId">\)[\s\S]*scope\.companyId, scope\.assetKind, scope\.assetId[\s\S]*scope\.companyId/, "refresh targets the submitted company and asset"],
  [/(?:if \(input\.generation !== actionGenerationRef\.current\) return;[\s\S]*?){5}/, "all five success callbacks reject stale scope"],
  [/useEffect\(\(\) => \{\s*actionGenerationRef\.current \+= 1;[\s\S]*mountMutation\.reset\(\);[\s\S]*brandMutation\.reset\(\);[\s\S]*rotateMutation\.reset\(\);[\s\S]*replaceMutation\.reset\(\);[\s\S]*treadMutation\.reset\(\);[\s\S]*setSelectedRecord\(null\);[\s\S]*\}, \[companyId, assetKind, assetId\]\)/, "scope switch retires every request and draft"],
  [/const snapshotScope = \(\): TireActionScope => \(\{\s*companyId,\s*assetKind,\s*assetId,\s*generation: actionGenerationRef\.current,\s*\}\)/, "action helper snapshots current scope"],
  [/mountMutation\.mutate\(\{ \.\.\.snapshotScope\(\), draft: \{ \.\.\.mountDraft \} \}\)/, "mount submits immutable scope and draft"],
  [/brandMutation\.mutate\(\{\s*companyId,\s*generation: actionGenerationRef\.current,\s*name: brandName,\s*\}\)/, "brand create submits immutable company and name"],
  [/rotateMutation\.mutate\(\{\s*\.\.\.snapshotScope\(\),\s*tireRecordId: String\(selectedRecord\?\.id\),\s*toPosition,\s*\}\)/, "rotate submits immutable record, position, and scope"],
  [/replaceMutation\.mutate\(\{\s*\.\.\.snapshotScope\(\),\s*tireRecordId: String\(selectedRecord\?\.id\),\s*draft: \{ \.\.\.mountDraft \},\s*\}\)/, "replace submits immutable record, draft, and scope"],
  [/treadMutation\.mutate\(\{\s*\.\.\.snapshotScope\(\),\s*tireRecordId: String\(selectedRecord\?\.id\),\s*treadDepth,\s*\}\)/, "tread audit submits immutable record, depth, and scope"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const missing = failures(source);
if (missing.length) {
  console.error(`verify-maintenance-tire-program-company-asset-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  for (const [pattern, label] of checks) {
    const mutant = source.replace(pattern, "/* planted defect */");
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-tire-program-company-asset-lifecycle SELFTEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-tire-program-company-asset-lifecycle SELFTEST PASS — ${checks.length}/${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-tire-program-company-asset-lifecycle PASS — ${checks.length} immutable company/asset lifecycle invariants`);
