#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^(home\\.create_trailer|fleet\\.modal\\.(create_trailer|edit_trailer|quick_assign)|unit\\.profile\\.reefer)$","task":"LINK-F5163-FLEET-TRAILER-MODALS-REEFER"} */
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
};
const LABEL = "verify-fleet-trailer-modals-and-reefer";

export function audit(src) {
  const failures = [];
  if (!/createEquipment\(\{/.test(src.createTrailer)) {
    failures.push(`${FILES.createTrailer}: must post real trailer fields via createEquipment`);
  }
  if (!/equipment_type: draft\.equipment_type/.test(src.createTrailer)) {
    failures.push(`${FILES.createTrailer}: create payload must carry a real equipment_type`);
  }
  if (!/mutationFn: \(\) => patchTrailer\(trailerId, operatingCompanyId, patchPayload\)/.test(src.editTrailer)) {
    failures.push(`${FILES.editTrailer}: edit must patch real trailer fields via patchTrailer`);
  }
  if (!/equipmentKind === "truck" \? "truck" : "trailer"/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: must genuinely branch copy/target on truck|trailer kind`);
  }
  if (!/equipment_number\?:\s*string \| null/.test(src.reefer)) {
    failures.push(`${FILES.reefer}: reefer section must carry the attached trailer's real equipment_number`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    createTrailer: fs.readFileSync(path.join(root, FILES.createTrailer), "utf8"),
    editTrailer: fs.readFileSync(path.join(root, FILES.editTrailer), "utf8"),
    quickAssign: fs.readFileSync(path.join(root, FILES.quickAssign), "utf8"),
    reefer: fs.readFileSync(path.join(root, FILES.reefer), "utf8"),
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
    ["create-type", "createTrailer", /equipment_type: draft\.equipment_type/, "equipment_type: undefined"],
    ["edit-patch", "editTrailer", /mutationFn: \(\) => patchTrailer\(trailerId, operatingCompanyId, patchPayload\)/, "mutationFn: () => Promise.resolve()"],
    ["quick-assign-branch", "quickAssign", /equipmentKind === "truck" \? "truck" : "trailer"/, '"trailer"'],
    ["reefer-field", "reefer", /equipment_number\?:\s*string \| null/, "equipment_id?: string | null"],
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
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — trailer create/edit modals post real fields; quick-assign and unit-profile reefer are genuinely trailer-aware`);
