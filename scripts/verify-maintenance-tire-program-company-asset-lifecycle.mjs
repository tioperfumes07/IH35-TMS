#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["unit","trailer","connectivity","reverse_link"],"leaves":["tires.create_record","tires.create_brand","tire.profile.rotate","tire.profile.replace","tire.profile.tread_audit"],"task":"MAINT-F6606-TIRE-COMPANY-ASSET-LIFECYCLE","vertical":"class-sweep"} */

import fs from "node:fs";

const path = "apps/frontend/src/pages/maintenance/TireProgramPage.tsx";
const source = fs.readFileSync(path, "utf8");
const backendPath = "apps/backend/src/maintenance/tires.routes.ts";
const backendSource = fs.readFileSync(backendPath, "utf8");
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
  [/const positions = layoutQ\.isError \? \[\] : \(layoutQ\.data\?\.positions \?\? \[\]\)/, "failed layout read suppresses cached tire positions"],
  [/if \(!layoutQ\.isError && !brandsQ\.isError\) return;[\s\S]*setMountOpen\(false\);[\s\S]*setAction\(null\);[\s\S]*setSelectedRecord\(null\);[\s\S]*setMountDraft\(EMPTY_MOUNT\);/, "failed layout or brand read retires retained tire actions"],
  [/disabled=\{!companyId \|\| !assetId \|\| layoutQ\.isError \|\| brandsQ\.isError\}/, "mount entry fails closed on layout or brand errors"],
  [/alertsQ\.isError \? \([\s\S]*title="Couldn't load tire alerts"[\s\S]*onRetry=\{\(\) => void alertsQ\.refetch\(\)\}/, "alert count failure is retryable and never claims zero"],
  [/layoutQ\.isError \? \([\s\S]*title="Couldn't load tire layout"[\s\S]*onRetry=\{\(\) => void layoutQ\.refetch\(\)\}[\s\S]*renderPositionGrid/, "layout failure replaces cached positions with exact Retry"],
  [/disabled=\{brandsQ\.isError\}[\s\S]*loading=\{brandsQ\.isLoading\}/, "brand picker fails closed on its canonical read"],
  [/disabled=\{layoutQ\.isError \|\| brandsQ\.isError \|\| !mountDraft\.position_code \|\| mountMutation\.isPending\}/, "mount submit fails closed on required reads"],
  [/disabled=\{brandsQ\.isError \|\| !brandName\.trim\(\) \|\| brandMutation\.isPending\}/, "brand submit fails closed on catalog read"],
  [/const eventRows = eventsQ\.isError \? \[\] : \(eventsQ\.data\?\.rows \?\? \[\]\);\s*const eventTotalCount = eventsQ\.isError \? 0 : \(eventsQ\.data\?\.total_count \?\? 0\);/, "event failure suppresses cached rows and exact count"],
];

const failures = (candidate) => checks.filter(([pattern]) => !pattern.test(candidate)).map(([, label]) => label);
const auditEvents = [
  "maintenance.tire_brand.created",
  "maintenance.tire_record.created",
  "maintenance.tire_record.updated",
  "maintenance.tire_record.archived",
  "maintenance.tire_rotated",
  "maintenance.tire_replaced",
  "maintenance.tire_tread_audited",
];
const backendFailures = (candidate) => auditEvents.flatMap((event) => {
  const index = candidate.indexOf(`\"${event}\"`);
  if (index < 0) return [`missing ${event} audit`];
  return candidate.slice(index, index + 420).includes("operating_company_id:")
    ? []
    : [`${event} audit omits operating_company_id`];
});
const missing = [...failures(source), ...backendFailures(backendSource)];
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
  for (const event of auditEvents) {
    const eventIndex = backendSource.indexOf(`\"${event}\"`);
    const companyIndex = backendSource.indexOf("operating_company_id:", eventIndex);
    const mutant = `${backendSource.slice(0, companyIndex)}PLANTED_COMPANY_SCOPE:${backendSource.slice(companyIndex + "operating_company_id:".length)}`;
    if (backendFailures(mutant).length === 0) {
      console.error(`verify-maintenance-tire-program-company-asset-lifecycle SELFTEST FAIL — ${event} tenantless audit`);
      process.exit(1);
    }
  }
  const mutationCount = checks.length + auditEvents.length;
  console.log(`verify-maintenance-tire-program-company-asset-lifecycle SELFTEST PASS — ${mutationCount}/${mutationCount} planted defects rejected`);
}

console.log(`verify-maintenance-tire-program-company-asset-lifecycle PASS — ${checks.length + auditEvents.length} immutable company/asset/audit lifecycle invariants`);
