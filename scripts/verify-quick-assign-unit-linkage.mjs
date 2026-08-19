#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","drivers"],"cols":["unit","connectivity","reverse_link","picker_law"],"leafRe":"^dispatch\\.modal\\.quick_assign$|^fleet\\.modal\\.quick_assign$|^unit\\.profile\\.(quick_assign|current_load)$","task":"THEATER-QUICK-ASSIGN-UNIT-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";

const LABEL = "verify-quick-assign-unit-linkage";
const files = {
  creator: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  service: "apps/backend/src/dispatch/quick-assign.service.ts",
  routes: "apps/backend/src/dispatch/quicksave.routes.ts",
  aggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
  reverse: "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,160}kind="unit"/.test(s.creator) || !/unit_id: unitId \|\| undefined/.test(s.creator)) failures.push("canonical unit picker-to-payload path missing");
  if ((s.service.match(/E_UNIT_NOT_FOUND/g) ?? []).length < 2 || (s.service.match(/deactivated_at IS NULL/g) ?? []).length < 2) failures.push("both create paths must reject missing, foreign, or inactive units");
  if (!/COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$2/.test(s.service) || !/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(s.service)) failures.push("both unit validations must be company scoped");
  if (!/assigned_unit_id = COALESCE\(\$3, assigned_unit_id\)/.test(s.service) || !/previous_unit_id, new_unit_id/.test(s.service)) failures.push("canonical unit FK sinks missing");
  if (!/code === "E_UNIT_NOT_FOUND"[\s\S]{0,120}status: 404/.test(s.routes)) failures.push("unit rejection route mapping missing");
  if (!/l\.assigned_unit_id = \$1::uuid/.test(s.aggregate) || !/l\.operating_company_id = \$2::uuid/.test(s.aggregate)) failures.push("exact entity-scoped unit reverse query missing");
  // Independently converged fix — kept this already-integrated version (also strengthened the
  // load-drill check to require EntityLinkOrTombstone explicitly, which CC-2's narrower re-anchor
  // did not touch).
  if (!/EntityLinkOrTombstone[\s\S]{0,120}kind="load"/.test(s.reverse) || !/Available — no active load assigned to unit/.test(s.reverse)) failures.push("canonical unresolved-safe load drill or honest empty state missing");
  if (!/unitNumber:\s*string/.test(s.reverse) || !/EntityLinkOrTombstone[\s\S]{0,120}kind="unit"[\s\S]{0,120}name=\{unitNumber\}/.test(s.reverse)) failures.push("empty-state unit reverse must consume canonical unit number through unresolved-safe drill");
  if (!/CurrentLoadSection currentLoad=\{profile\.current_load\} unitId=\{id\} unitNumber=\{unitNumber\}/.test(s.profile)) failures.push("unit profile reverse mount must forward canonical unit number");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "creator", /kind="unit"/, 'kind="trailer"'],
    ["payload", "creator", /unit_id: unitId \|\| undefined/, "unit_id: undefined"],
    ["reject", "service", /E_UNIT_NOT_FOUND/g, "E_UNIT_UNKNOWN"],
    ["active", "service", /deactivated_at IS NULL/g, "TRUE"],
    ["scope1", "service", /COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$2/, "TRUE"],
    ["scope2", "service", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g, "TRUE"],
    ["sink", "service", /assigned_unit_id = COALESCE\(\$3, assigned_unit_id\)/g, "assigned_unit_id = assigned_unit_id"],
    ["route", "routes", /code === "E_UNIT_NOT_FOUND"/, 'code === "E_UNKNOWN"'],
    ["reverse", "aggregate", /l\.assigned_unit_id = \$1::uuid/g, "TRUE"],
    ["drill", "reverse", /EntityLinkOrTombstone kind="load"/, 'EntityLinkOrTombstone kind="unit"'],
    ["label-contract", "reverse", /unitNumber:\s*string/, "unitNumber?: string"],
    ["label-consumer", "reverse", /name=\{unitNumber\}/, "name={null}"],
    ["label-parent", "profile", / unitNumber=\{unitNumber\}/, ""],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→active tenant validation→load FK→exact profile reverse`);
