#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^(home\\.create_trailer|fleet\\.modal\\.(create_trailer|edit_trailer|quick_assign)|unit\\.profile\\.reefer)$","task":"LINK-F5163-FLEET-TRAILER-MODALS-REEFER"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.reefer"],"task":"FLEET-F5914-REEFER-TRAILER-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["fleet.modal.create_trailer","fleet.modal.edit_trailer","fleet.modal.quick_assign","unit.profile.reefer"],"task":"FLEET-F5934-TRAILER-MODAL-REEFER-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): the fleet Create-Trailer modal
 * (mounted both from the Fleet Home "+ Create Trailer" action and as its own component leaf) posts
 * real trailer fields via createEquipment; Edit-Trailer patches real fields via patchTrailer;
 * Quick-Assign has a real truck|trailer kind branch changing its copy/target; and a unit's own
 * profile Reefer section renders the attached trailer's real reefer telemetry (equipment_number,
 * hours, service due).
 *
 * Self-test: node scripts/verify-fleet-trailer-modals-and-reefer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  createTrailer: "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
  editTrailer: "apps/frontend/src/components/fleet/EditTrailerModal.tsx",
  quickAssign: "apps/frontend/src/components/fleet/QuickAssignModal.tsx",
  reefer: "apps/frontend/src/components/vehicle-profile/ReeferSection.tsx",
  aggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
  required: "docs/specs/scoreboard/modules/fleet.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-fleet-trailer-modals-and-reefer.mjs",
};
const LABEL = "verify-fleet-trailer-modals-and-reefer";
const EXACT_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.reefer"],"task":"FLEET-F5914-REEFER-TRAILER-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_LEAVES = ["fleet.modal.create_trailer", "fleet.modal.edit_trailer", "fleet.modal.quick_assign", "unit.profile.reefer"];
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["fleet.modal.create_trailer","fleet.modal.edit_trailer","fleet.modal.quick_assign","unit.profile.reefer"],"task":"FLEET-F5934-TRAILER-MODAL-REEFER-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

export function audit(src) {
  const failures = [];
  if (!/createEquipment\(\{/.test(src.createTrailer)) {
    failures.push(`${FILES.createTrailer}: must post real trailer fields via createEquipment`);
  }
  if (!/equipment_type: input\.draft\.equipment_type/.test(src.createTrailer)) {
    failures.push(`${FILES.createTrailer}: create payload must carry a real equipment_type`);
  }
  if (!/mutationFn: \(input: \{ trailerId: string; companyId: string; generation: number; patch: Record<string, unknown> \}\) => patchTrailer\(input\.trailerId, input\.companyId, input\.patch\)/.test(src.editTrailer)) {
    failures.push(`${FILES.editTrailer}: edit must patch real trailer fields via patchTrailer`);
  }
  if (!/profileQuery\.isError[\s\S]{0,220}<ListErrorState[\s\S]{0,220}onRetry=\{\(\) => void profileQuery\.refetch\(\)\}/.test(src.editTrailer)) {
    failures.push(`${FILES.editTrailer}: failed canonical trailer reads must expose exact retry`);
  }
  if (!/disabled=\{profileQuery\.isError \|\| companiesQuery\.isError\}/.test(src.editTrailer)) {
    failures.push(`${FILES.editTrailer}: failed canonical trailer or company reads must disable destructive patch saves`);
  }
  if (!/equipmentKind === "truck" \? "truck" : "trailer"/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: must genuinely branch copy/target on truck|trailer kind`);
  }
  if (!/equipment_number\?:\s*string \| null/.test(src.reefer)) {
    failures.push(`${FILES.reefer}: reefer section must carry the attached trailer's real equipment_number`);
  }
  if (!/attached_trailer_id\?:\s*string \| null/.test(src.reefer)) {
    failures.push(`${FILES.reefer}: reefer section must carry the attached trailer's canonical id`);
  }
  if (!/WHERE e\.current_unit_id = \$1::uuid\s+AND \(e\.owner_company_id = \$2::uuid OR e\.currently_leased_to_company_id = \$2::uuid\)\s+AND e\.equipment_type = 'Reefer'/.test(src.aggregate)) {
    failures.push(`${FILES.aggregate}: attached reefer reverse must remain visible to its owner or current lessee`);
  }
  if (
    !/EntityLinkOrTombstone/.test(src.reefer) ||
    !/kind="trailer"/.test(src.reefer) ||
    !/id=\{reefer\.attached_trailer_id\}/.test(src.reefer) ||
    !/vp-reefer-trailer-link/.test(src.reefer)
  ) {
    failures.push(
      `${FILES.reefer}: attached trailer heading must drill through with EntityLinkOrTombstone (unresolved-safe) + vp-reefer-trailer-link`,
    );
  }
  let leaf;
  const connectivityLeaves = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "unit.profile.reefer" && Array.isArray(value.required)) leaf = value;
      if (CONNECTIVITY_LEAVES.includes(value.id) && Array.isArray(value.required)) connectivityLeaves.set(value.id, value);
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(src.required));
  if (!leaf) failures.push("Fleet unit.profile.reefer Required leaf missing");
  else {
    if (!leaf.required.includes("reverse_link")) failures.push("Fleet reefer leaf must require reverse_link");
    if (leaf.route_hint !== "/fleet/units/:id") failures.push("Fleet reefer leaf must mount on canonical unit profile");
  }
  if (!src.self.split("/**\n * OWNER-")[0].includes(EXACT_HEADER)) failures.push("exact Fleet reefer reverse header missing");
  for (const id of CONNECTIVITY_LEAVES) {
    if (!connectivityLeaves.get(id)?.required?.includes("connectivity")) failures.push(`Fleet ${id} must require connectivity`);
  }
  if (!src.self.split("/**\n * OWNER-")[0].includes(CONNECTIVITY_HEADER)) failures.push("exact Fleet trailer modal/reefer connectivity header missing");
  if (/"guard"\s*:\s*"scripts\/verify-fleet-trailer-modals-and-reefer\.mjs"/.test(src.feed)) failures.push("manual feed duplicates Fleet reefer ownership");
  return failures;
}

function loadSrc(root) {
  return {
    createTrailer: fs.readFileSync(path.join(root, FILES.createTrailer), "utf8"),
    editTrailer: fs.readFileSync(path.join(root, FILES.editTrailer), "utf8"),
    quickAssign: fs.readFileSync(path.join(root, FILES.quickAssign), "utf8"),
    reefer: fs.readFileSync(path.join(root, FILES.reefer), "utf8"),
    aggregate: fs.readFileSync(path.join(root, FILES.aggregate), "utf8"),
    required: fs.readFileSync(path.join(root, FILES.required), "utf8"),
    feed: fs.readFileSync(path.join(root, FILES.feed), "utf8"),
    self: fs.readFileSync(path.join(root, FILES.self), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["create-call", "createTrailer", /createEquipment\(\{/, "createSomethingElse({"],
    ["create-type", "createTrailer", /equipment_type: input\.draft\.equipment_type/, "equipment_type: undefined"],
    ["edit-patch", "editTrailer", /mutationFn: \(input: \{ trailerId: string; companyId: string; generation: number; patch: Record<string, unknown> \}\) => patchTrailer\(input\.trailerId, input\.companyId, input\.patch\)/, "mutationFn: () => Promise.resolve()"],
    ["edit-read-retry", "editTrailer", /onRetry=\{\(\) => void profileQuery\.refetch\(\)\}/, "onRetry={undefined}"],
    ["edit-save-profile-gate", "editTrailer", /disabled=\{profileQuery\.isError \|\| companiesQuery\.isError\}/, "disabled={companiesQuery.isError}"],
    ["edit-save-company-gate", "editTrailer", /disabled=\{profileQuery\.isError \|\| companiesQuery\.isError\}/, "disabled={profileQuery.isError}"],
    ["quick-assign-branch", "quickAssign", /equipmentKind === "truck" \? "truck" : "trailer"/, '"trailer"'],
    ["reefer-field", "reefer", /equipment_number\?:\s*string \| null/, "equipment_id?: string | null"],
    ["reefer-id", "reefer", /attached_trailer_id\?:\s*string \| null/, "attached_trailer_ref?: string | null"],
    ["reefer-link", "reefer", /kind="trailer"/, 'kind="unit"'],
    ["reefer-tombstone", "reefer", /EntityLinkOrTombstone/g, "EntityLink"],
    ["reefer-testid", "reefer", /vp-reefer-trailer-link/g, "vp-reefer-trailer-gone"],
    ["reefer-owner-scope", "aggregate", /\(e\.owner_company_id = \$2::uuid OR e\.currently_leased_to_company_id = \$2::uuid\)/, "COALESCE(e.currently_leased_to_company_id, e.owner_company_id) = $2::uuid"],
    ["leaf", "required", /"unit\.profile\.reefer"/, '"unit.profile.reefer_MISSING"'],
    ["reverse", "required", /("id": "unit\.profile\.reefer"[\s\S]{0,260})"reverse_link"/, '$1"reverse_link_MISSING"'],
    ["route", "required", /("id": "unit\.profile\.reefer"[\s\S]{0,180})"\/fleet\/units\/:id"/, '$1"/fleet/trailers/:id"'],
    ["header", "self", EXACT_HEADER, EXACT_HEADER.replace("reverse_link", "connectivity")],
    ["connectivity-header", "self", CONNECTIVITY_HEADER, CONNECTIVITY_HEADER.replace("connectivity", "unit")],
    ["feed", "feed", /\[\s*/, `[\n  {"guard":"scripts/verify-fleet-trailer-modals-and-reefer.mjs"},`],
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
    const mutated = { ...good, required: good.required.replace(`"id": "${id}"`, `"id": "${id}_MISSING"`) };
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — connectivity leaf escaped: ${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + CONNECTIVITY_LEAVES.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — trailer create/edit modals post real fields; quick-assign and unit-profile reefer are genuinely trailer-aware`);
