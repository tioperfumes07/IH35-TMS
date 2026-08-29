#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.profile\\.(identity|telemetry|driver_assign|quick_assign|current_load|trip_cost|maintenance|compliance|expenses_reverse|insurance_summary|reefer|financial_pl|documents|legal_reverse|insurance_claims_reverse|safety_reverse|border_crossings_reverse|bank_txns|audit_history|qbo_mapping|action_bar)$","task":"LINK-F5167-FLEET-UNIT-PROFILE"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.edit\\.(identity|insurance|irp_plates|reefer|financial|lifecycle|quick_availability|documents)$","task":"LINK-F5167-FLEET-UNIT-EDIT"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^unit\\.detail\\.(permits|toll_tags|tasks|brakes|tires|finance_linkage)$","task":"LINK-F5167-FLEET-UNIT-DETAIL"} */
/** @matrix-built {"modules":["fleet"],"cols":["unit"],"leafRe":"^trailer\\.profile\\.assignment$","task":"LINK-F5167-FLEET-TRAILER-ASSIGNMENT-UNIT"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.detail.permits","unit.detail.tasks"],"task":"FLEET-F5932-UNIT-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.identity","unit.profile.telemetry","unit.profile.current_load","unit.profile.trip_cost","unit.profile.maintenance","unit.profile.compliance","unit.profile.action_bar","unit.profile.audit_history"],"task":"FLEET-F5946-UNIT-PROFILE-CORE-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.edit.identity","unit.edit.insurance","unit.edit.irp_plates","unit.edit.reefer","unit.edit.financial","unit.edit.lifecycle"],"task":"FLEET-F5947-UNIT-EDIT-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.detail.toll_tags","unit.detail.brakes","unit.detail.tires"],"task":"FLEET-F5949-UNIT-DETAIL-SPECIALTY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.qbo_mapping"],"task":"FLEET-F5953-ASSET-CLASSIFICATION-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): VehicleProfilePage.tsx's 20
 * unit.profile.* sections and EditVehicleModal.tsx's 8 unit.edit.* tabs are all genuinely
 * self-referential to THIS unit (fetchUnitProfile(id,...)/patchUnit(id/unitId, companyId, ...) —
 * the page's own :id route param). UnitDetail.tsx's 6 unit.detail.* tabs are the same
 * self-referential pattern. trailer.profile.assignment genuinely shows the real attached truck's
 * unit_id via EntityLink.
 *
 * patchUnit(id, operatingCompanyId, body) gained its companyId parameter in PR #13510
 * (fix(fleet): scope all unit saves to selected company) — both call sites here were already
 * correctly updated by that PR, this guard's literal patterns just weren't (LST-ORPH-04 sweep,
 * 2026-08-22).
 *
 * Self-test: node scripts/verify-fleet-unit-profile-edit-detail.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  telemetry: "apps/frontend/src/components/vehicle-profile/LiveTelemetrySection.tsx",
  editModal: "apps/frontend/src/components/fleet/EditVehicleModal.tsx",
  unitDetail: "apps/frontend/src/pages/units/UnitDetail.tsx",
  assignment: "apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx",
  missingRequired: "apps/frontend/src/components/compliance/MissingRequiredChip.tsx",
  backhaul: "apps/frontend/src/components/reports/BackhaulSuggestionsWidget.tsx",
  required: "docs/specs/scoreboard/modules/fleet.required.json",
  self: "scripts/verify-fleet-unit-profile-edit-detail.mjs",
};
const LABEL = "verify-fleet-unit-profile-edit-detail";
const CONNECTIVITY_LEAVES = ["unit.detail.permits", "unit.detail.tasks"];
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.detail.permits","unit.detail.tasks"],"task":"FLEET-F5932-UNIT-DETAIL-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const PROFILE_CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.identity","unit.profile.telemetry","unit.profile.current_load","unit.profile.trip_cost","unit.profile.maintenance","unit.profile.compliance","unit.profile.action_bar","unit.profile.audit_history"],"task":"FLEET-F5946-UNIT-PROFILE-CORE-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const PROFILE_CONNECTIVITY = new Map([
  ["unit.profile.identity", /data-testid="vp-section-1-identity"[\s\S]{0,220}<IdentityStatusHeader[\s\S]{0,120}unitId=\{id\}/],
  ["unit.profile.telemetry", /data-testid="vp-section-2-telemetry"[\s\S]{0,520}<LiveTelemetrySection/],
  ["unit.profile.current_load", /data-testid="vp-section-4-load"[\s\S]{0,180}<CurrentLoadSection[\s\S]{0,120}unitId=\{id\}/],
  ["unit.profile.trip_cost", /data-testid="vp-section-4-load"[\s\S]{0,500}<TripCostCalculator unitId=\{id\} companyId=\{companyId\}/],
  ["unit.profile.maintenance", /data-testid="vp-section-5-maintenance"[\s\S]{0,360}<MaintenanceSnapshotSection[\s\S]{0,220}unitId=\{id\}/],
  ["unit.profile.compliance", /data-testid="vp-section-6-compliance"[\s\S]{0,120}<ComplianceSection compliance=\{profile\.compliance\}/],
  ["unit.profile.action_bar", /data-testid="vp-section-11-action-bar"[\s\S]{0,180}<ActionBar[\s\S]{0,100}unitId=\{id\}[\s\S]{0,100}companyId=\{companyId\}/],
  ["unit.profile.audit_history", /data-testid="vp-section-12-audit-history"[\s\S]{0,240}<EntityAuditHistoryTab operatingCompanyId=\{companyId\} entityType="unit" entityId=\{id\}/],
]);
const EDIT_CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.edit.identity","unit.edit.insurance","unit.edit.irp_plates","unit.edit.reefer","unit.edit.financial","unit.edit.lifecycle"],"task":"FLEET-F5947-UNIT-EDIT-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const EDIT_CONNECTIVITY = new Map([
  ["unit.edit.identity", /\{ key: "unit_number", label: "Unit Number", type: "text", tab: "Identity" \}/],
  ["unit.edit.insurance", /\{ key: "us_insurance_carrier", label: "US Insurance Carrier", type: "text", tab: "Insurance" \}/],
  ["unit.edit.irp_plates", /\{ key: "texas_irp_number", label: "Texas IRP Number", type: "text", tab: "IRP \/ Plates" \}/],
  ["unit.edit.reefer", /activeTab === "Reefer"[\s\S]{0,180}<FieldSet title="Reefer \(linked trailer\)"/],
  ["unit.edit.financial", /\{ key: "acquired_date", label: "Acquired Date", type: "date", tab: "Financial" \}/],
  ["unit.edit.lifecycle", /\{ key: "sold_date", label: "Sale Date", type: "date", tab: "Lifecycle"/],
]);
const DETAIL_CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.detail.toll_tags","unit.detail.brakes","unit.detail.tires"],"task":"FLEET-F5949-UNIT-DETAIL-SPECIALTY-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const DETAIL_CONNECTIVITY = new Map([
  ["unit.detail.toll_tags", /activeTab === "toll-tags" \? <UnitTollTagsTab unitId=\{id\} companyId=\{companyId\}/],
  ["unit.detail.brakes", /activeTab === "brakes" \? <UnitBrakesTab unitId=\{id\} companyId=\{companyId\}/],
  ["unit.detail.tires", /activeTab === "tires" \? <UnitTiresTab unitId=\{id\} companyId=\{companyId\}/],
]);
const CLASSIFICATION_CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.qbo_mapping"],"task":"FLEET-F5953-ASSET-CLASSIFICATION-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

export function audit(src) {
  const failures = [];
  const required = JSON.parse(src.required);
  if (!/fetchUnitProfile\(id, companyId/.test(src.profile)) {
    failures.push(`${FILES.profile}: unit.profile.* sections must all be fed by a real fetchUnitProfile(id, ...) query`);
  }
  if (!/patchUnit\(input\.unitId, input\.companyId, input\.patch\)/.test(src.profile)) {
    failures.push(`${FILES.profile}: profile-level unit edits (e.g. QBO mapping) must patch the real unit id`);
  }
  if (!/const qboAvailable = selectedCompany\?\.code === ["']TRANSP["']/.test(src.profile)) {
    failures.push(`${FILES.profile}: QBO mapping capability must derive from selected TRANSP company`);
  }
  if (!/qboAvailable \? <label[\s\S]{0,180}?QBO vendor \(ownership \/ lease entity\)/.test(src.profile)) {
    failures.push(`${FILES.profile}: QBO vendor control must be absent outside TRANSP`);
  }
  if (!/\.\.\.\(qboAvailable \? \{ qbo_vendor_id:[\s\S]{0,80}?\} : \{\}\)/.test(src.profile)) {
    failures.push(`${FILES.profile}: non-QBO class saves must not overwrite qbo_vendor_id`);
  }
  if (!/qboAvailable \? "QBO mapping" : "Asset classification"/.test(src.profile) ||
      !/<SelectCombobox[\s\S]{0,180}value=\{qboClassTmsId\}/.test(src.profile) ||
      !/qbo_class_id: qboClassTmsId \|\| null/.test(src.profile)) {
    failures.push(`${FILES.profile}: unit.profile.qbo_mapping must retain USMCA TMS class connectivity while gating QBO vendor mapping to TRANSP`);
  }
  if (!/classesQuery\.isError[\s\S]{0,240}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void classesQuery\.refetch\(\)\}/.test(src.profile)) {
    failures.push(`${FILES.profile}: failed TMS class catalog read must expose exact retry`);
  }
  if (!/value=\{qboClassTmsId\} disabled=\{classesQuery\.isError\}/.test(src.profile) ||
      !/disabled=\{!id \|\| !companyId \|\| classesQuery\.isError\}/.test(src.profile)) {
    failures.push(`${FILES.profile}: failed TMS class catalog read must disable selection and save`);
  }
  if (!/profileQuery\.isPending \? ["']Loading…["'] : String\(entityLabel/.test(src.profile)) {
    failures.push(`${FILES.profile}: loading state must not render a false Unit — not visible identity`);
  }
  if (!/AbortSignal\.timeout\(15_000\)/.test(src.profile) && !/AbortSignal\.timeout\(15000\)/.test(src.profile)) {
    failures.push(`${FILES.profile}: hung unit aggregate must AbortSignal.timeout(15_000) so Loading cannot stick forever`);
  }
  if (!/profileQuery\.isError[\s\S]{0,160}<ListErrorState/.test(src.profile)) {
    failures.push(`${FILES.profile}: unit profile outage must be explicit ListErrorState + retry`);
  }
  if (!/faultSummaryQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void faultSummaryQuery\.refetch\(\)\}/.test(src.profile)) {
    failures.push(`${FILES.profile}: active-fault reverse-read failure must be visible and retryable`);
  }
  if (!/telemetryQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void telemetryQuery\.refetch\(\)\}/.test(src.profile)) {
    failures.push(`${FILES.profile}: live-telemetry refresh failure must be visible and retryable instead of silently falling back`);
  }
  if (!/Active fault codes \(\{faults\.length\}\)/.test(src.telemetry) ||
      !/\{faults\.map\(\(f\) => \(/.test(src.telemetry)) {
    failures.push(`${FILES.telemetry}: unit.profile.telemetry must disclose and render the complete current active-fault snapshot`);
  }
  if (/faults\.slice\(/.test(src.telemetry)) {
    failures.push(`${FILES.telemetry}: unit.profile.telemetry must not silently cap the current active-fault snapshot`);
  }
  if (!/\{profile \? <div id=["']asset-financial["']/.test(src.profile)) {
    failures.push(`${FILES.profile}: classification controls must not render before the profile resolves`);
  }
  if ((src.profile.match(/unitId=\{id\}/g) || []).length < 10) {
    failures.push(`${FILES.profile}: unit.profile.* reverse-drill sections must be self-referentially scoped via unitId={id}`);
  }
  if (!/patchUnit\(input\.unitId, input\.companyId, input\.patch\)/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: unit.edit.* tabs must all patch the real edited unit's own id`);
  }
  if (!/profileQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void profileQuery\.refetch\(\)\}/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: failed canonical unit reads must expose exact retry`);
  }
  if (!/disabled=\{saveMutation\.isPending \|\| profileQuery\.isError \|\| companiesQuery\.isError \|\| !unitId\}/.test(src.editModal)) {
    failures.push(`${FILES.editModal}: failed canonical unit reads must disable destructive patch saves`);
  }
  if (!/<UnitPermitsTab unitId=\{id\}/.test(src.unitDetail) || !/<UnitFinanceLinkageTab unitId=\{id\}/.test(src.unitDetail)) {
    failures.push(`${FILES.unitDetail}: unit.detail.* tabs must be self-referentially scoped via unitId={id}`);
  }
  if (!/targetType="unit" targetId=\{id\}/.test(src.unitDetail)) {
    failures.push(`${FILES.unitDetail}: unit.detail.tasks must scope TasksTab to targetType="unit" targetId={id}`);
  }
  if (!/getUnit\(id, companyId\)/.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: detail shell must read canonical company-scoped unit identity`);
  if (!/unitQuery\.isPending\s*\? "Loading unit…"\s*:\s*unitQuery\.isError\s*\? "Unit identity unavailable"\s*:\s*entityLabel\(unitQuery\.data\?\.unit_number, id, "Unit"\)/.test(src.unitDetail)) {
    failures.push(`${FILES.unitDetail}: pending/error/success identity states must not paint a false Unit — not visible tombstone`);
  }
  if (!/entityLabel\(unitQuery\.data\?\.unit_number, id, "Unit"\)/.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: detail shell must resolve unit_number`);
  if (!/breadcrumb=\{\["Fleet", "Units", unitLabel\]\}/.test(src.unitDetail) || !/title=\{unitLabel\}/.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: breadcrumb/title must consume resolved unit identity`);
  if (!/targetLabel=\{unitLabel\}/.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: tasks must consume resolved unit identity`);
  if (!/unitQuery\.isError[\s\S]{0,220}<ListErrorState/.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: unit identity outage must be explicit and retryable`);
  if (!/unit\?\.unit_id \?[\s\S]{0,120}EntityLinkOrTombstone[\s\S]{0,100}id=\{String\(unit\.unit_id\)\}[\s\S]{0,80}name=\{unit\.unit_number\}/.test(src.assignment)) {
    failures.push(`${FILES.assignment}: trailer.profile.assignment must render a real or tombstoned attached-unit drill`);
  }
  if (!/query\.isError[\s\S]{0,500}role="alert"[\s\S]{0,500}onClick=\{\(\) => void query\.refetch\(\)\}/.test(src.missingRequired) ||
      !/!query\.isSuccess \|\| !query\.data/.test(src.missingRequired)) {
    failures.push(`${FILES.missingRequired}: required-document GET failure must be visible and exactly retryable before the loading/absence gate`);
  }
  if (!/query\.isError[\s\S]{0,260}<ListErrorState[\s\S]{0,260}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(src.backhaul)) {
    failures.push(`${FILES.backhaul}: backhaul GET failure must expose exact retry`);
  }
  if (!/!query\.isLoading && !query\.isError && suggestions\.length === 0/.test(src.backhaul)) {
    failures.push(`${FILES.backhaul}: failed backhaul GET must not render a false no-profitable-lanes empty state`);
  }
  for (const id of CONNECTIVITY_LEAVES) {
    if (!required.leaves?.find((leaf) => leaf.id === id)?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
  }
  if (!src.self.split("\n").includes(CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact unit-detail connectivity header missing`);
  for (const [id, pattern] of PROFILE_CONNECTIVITY) {
    if (!pattern.test(src.profile)) failures.push(`${FILES.profile}: ${id} distinct mounted connectivity missing`);
    if (!required.leaves?.find((leaf) => leaf.id === id)?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
  }
  if (!src.self.split("\n").includes(PROFILE_CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact unit-profile core connectivity header missing`);
  for (const [id, pattern] of EDIT_CONNECTIVITY) {
    if (!pattern.test(src.editModal)) failures.push(`${FILES.editModal}: ${id} distinct edit tab missing`);
    if (!required.leaves?.find((leaf) => leaf.id === id)?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
  }
  if (!src.self.split("\n").includes(EDIT_CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact unit-edit connectivity header missing`);
  for (const [id, pattern] of DETAIL_CONNECTIVITY) {
    if (!pattern.test(src.unitDetail)) failures.push(`${FILES.unitDetail}: ${id} distinct detail tab missing`);
    if (!required.leaves?.find((leaf) => leaf.id === id)?.required?.includes("connectivity")) failures.push(`${FILES.required}: ${id} must require connectivity`);
  }
  if (!src.self.split("\n").includes(DETAIL_CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact specialty unit-detail connectivity header missing`);
  if (!required.leaves?.find((leaf) => leaf.id === "unit.profile.qbo_mapping")?.required?.includes("connectivity")) failures.push(`${FILES.required}: unit.profile.qbo_mapping must require connectivity`);
  if (!src.self.split("\n").includes(CLASSIFICATION_CONNECTIVITY_HEADER)) failures.push(`${FILES.self}: exact asset-classification connectivity header missing`);
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["profile-query", "profile", /fetchUnitProfile\(id, companyId(?:, signal)?\)/g, "fetchSomethingElse(id, companyId)"],
    ["profile-patch", "profile", /patchUnit\(input\.unitId, input\.companyId, input\.patch\)/, "patchSomethingElse(input.unitId, input.companyId, input.patch)"],
    ["profile-qbo-capability", "profile", /const qboAvailable = selectedCompany\?\.code === "TRANSP";/, "const qboAvailable = true;"],
    ["profile-qbo-control", "profile", /qboAvailable \? <label/, "true ? <label"],
    ["profile-qbo-write", "profile", /\.\.\.\(qboAvailable \? \{ qbo_vendor_id:/, "...({ qbo_vendor_id:"],
    ["profile-class-control", "profile", /<SelectCombobox className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" value=\{qboClassTmsId\}/, "<SelectCombobox value={undefined}"],
    ["profile-class-write", "profile", /qbo_class_id: qboClassTmsId \|\| null/, "qbo_class_id: null"],
    ["profile-class-retry", "profile", /onRetry=\{\(\) => void classesQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["profile-class-select-gate", "profile", /value=\{qboClassTmsId\} disabled=\{classesQuery\.isError\}/, "value={qboClassTmsId}"],
    ["profile-class-save-gate", "profile", /!id \|\| !companyId \|\| classesQuery\.isError/, "!id || !companyId"],
    ["profile-loading-label", "profile", /profileQuery\.isPending \? "Loading…" : String\(entityLabel/, "String(entityLabel"],
    ["profile-timeout", "profile", /AbortSignal\.timeout\(15_000\)/, "AbortSignal.timeout(999_000)"],
    ["profile-error-state", "profile", /profileQuery\.isError \? \(\s*<ListErrorState/, "profileQuery.isError ? (<div"],
    ["profile-fault-error", "profile", /onRetry=\{\(\) => void faultSummaryQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["profile-telemetry-error", "profile", /onRetry=\{\(\) => void telemetryQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["telemetry-complete-fault-list", "telemetry", /\{faults\.map\(\(f\) => \(/, "{faults.slice(0, 3).map((f) => ("],
    ["telemetry-fault-count", "telemetry", /Active fault codes \(\{faults\.length\}\)/, "Active fault codes"],
    ["profile-loading-controls", "profile", /\{profile \? <div id="asset-financial"/, '<div id="asset-financial"'],
    ["profile-scoping", "profile", /unitId=\{id\}/g, "unitId={undefined}"],
    ["edit-modal-patch", "editModal", /patchUnit\(input\.unitId, input\.companyId, input\.patch\)/, "patchUnit(undefined, input.companyId, input.patch)"],
    ["edit-modal-read-retry", "editModal", /onRetry=\{\(\) => void profileQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["edit-modal-save-gate", "editModal", /saveMutation\.isPending \|\| profileQuery\.isError \|\| companiesQuery\.isError \|\| !unitId/, "saveMutation.isPending || !unitId"],
    ["unit-detail-permits", "unitDetail", /<UnitPermitsTab unitId=\{id\}/, "<UnitPermitsTab unitId={undefined}"],
    ["unit-detail-tasks", "unitDetail", /targetType="unit" targetId=\{id\}/, 'targetType="load" targetId={id}'],
    ["unit-detail-query", "unitDetail", /getUnit\(id, companyId\)/, "getUnit(id, '')"],
    ["unit-detail-loading-honesty", "unitDetail", /unitQuery\.isPending\s*\? "Loading unit…"/, 'false ? "Loading unit…"'],
    ["unit-detail-label", "unitDetail", /entityLabel\(unitQuery\.data\?\.unit_number, id, "Unit"\)/, 'entityLabel(null, id, "Unit")'],
    ["unit-detail-title", "unitDetail", /title=\{unitLabel\}/, 'title="Unit"'],
    ["unit-detail-task-label", "unitDetail", /targetLabel=\{unitLabel\}/, 'targetLabel="Unit"'],
    ["unit-detail-error", "unitDetail", /unitQuery\.isError/, "false"],
    ["assignment-link", "assignment", /unit\?\.unit_id \?[\s\S]{0,100}id=\{String\(unit\.unit_id\)\}/, 'kind="trailer" id={unit.trailer_id}'],
    ["missing-required-error", "missingRequired", /query\.isError/, "false"],
    ["missing-required-retry", "missingRequired", /onClick=\{\(\) => void query\.refetch\(\)\}/, "onClick={undefined}"],
    ["backhaul-retry", "backhaul", /onRetry=\{\(\) => void query\.refetch\(\)\}/, "onRetry={undefined}"],
    ["backhaul-false-empty", "backhaul", /!query\.isLoading && !query\.isError && suggestions\.length === 0/, "!query.isLoading && suggestions.length === 0"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  for (const id of CONNECTIVITY_LEAVES) {
    const mutated = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — Required connectivity mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  const wrongHeader = { ...good, self: good.self.replace(CONNECTIVITY_HEADER, `${CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — exact connectivity header mutation escaped`);
    process.exit(1);
  }
  for (const [id, pattern] of PROFILE_CONNECTIVITY) {
    const runtimeMutation = { ...good, profile: good.profile.replace(pattern, "REMOVED_PROFILE_SECTION") };
    if (runtimeMutation.profile === good.profile || audit(runtimeMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — profile runtime mutation escaped: ${id}`);
      process.exit(1);
    }
    const requiredMutation = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (audit(requiredMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — profile Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  const wrongProfileHeader = { ...good, self: good.self.replace(PROFILE_CONNECTIVITY_HEADER, `${PROFILE_CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongProfileHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — profile connectivity header mutation escaped`);
    process.exit(1);
  }
  for (const [id, pattern] of EDIT_CONNECTIVITY) {
    const runtimeMutation = { ...good, editModal: good.editModal.replace(pattern, "REMOVED_EDIT_TAB") };
    if (runtimeMutation.editModal === good.editModal || audit(runtimeMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — edit runtime mutation escaped: ${id}`);
      process.exit(1);
    }
    const requiredMutation = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (audit(requiredMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — edit Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  const wrongEditHeader = { ...good, self: good.self.replace(EDIT_CONNECTIVITY_HEADER, `${EDIT_CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongEditHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — edit connectivity header mutation escaped`);
    process.exit(1);
  }
  for (const [id, pattern] of DETAIL_CONNECTIVITY) {
    const runtimeMutation = { ...good, unitDetail: good.unitDetail.replace(pattern, "REMOVED_DETAIL_TAB") };
    if (runtimeMutation.unitDetail === good.unitDetail || audit(runtimeMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — detail runtime mutation escaped: ${id}`);
      process.exit(1);
    }
    const requiredMutation = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}.broken"`) };
    if (audit(requiredMutation).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — detail Required mutation escaped: ${id}`);
      process.exit(1);
    }
  }
  const wrongDetailHeader = { ...good, self: good.self.replace(DETAIL_CONNECTIVITY_HEADER, `${DETAIL_CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongDetailHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — specialty detail connectivity header mutation escaped`);
    process.exit(1);
  }
  const classificationRequired = { ...good, required: good.required.replace('"id": "unit.profile.qbo_mapping"', '"id": "unit.profile.qbo_mapping.broken"') };
  if (audit(classificationRequired).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — asset classification Required mutation escaped`);
    process.exit(1);
  }
  const wrongClassificationHeader = { ...good, self: good.self.replace(CLASSIFICATION_CONNECTIVITY_HEADER, `${CLASSIFICATION_CONNECTIVITY_HEADER}.broken`) };
  if (audit(wrongClassificationHeader).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — asset classification header mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + CONNECTIVITY_LEAVES.length + 1 + (PROFILE_CONNECTIVITY.size * 2) + 1 + (EDIT_CONNECTIVITY.size * 2) + 1 + (DETAIL_CONNECTIVITY.size * 2) + 1 + 2} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet unit profile/edit/detail surfaces are genuinely self-referential`);
