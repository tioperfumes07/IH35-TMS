#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","fleet","drivers"],"cols":["unit","connectivity","picker_law"],"leafRe":"^dispatch\\.modal\\.quick_assign$|^fleet\\.modal\\.quick_assign$|^unit\\.profile\\.(quick_assign|current_load)$","task":"THEATER-QUICK-ASSIGN-UNIT-LEAFRE","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.current_load"],"task":"FLEET-F5907-CURRENT-LOAD-TASKS-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-quick-assign-unit-linkage";
const files = {
  creator: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  service: "apps/backend/src/dispatch/quick-assign.service.ts",
  routes: "apps/backend/src/dispatch/quicksave.routes.ts",
  aggregate: "apps/backend/src/mdata/unit-aggregate.service.ts",
  reverse: "apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx",
  profile: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  matrix: "docs/specs/scoreboard/modules/fleet.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-quick-assign-unit-linkage.mjs",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.current_load"],"task":"FLEET-F5907-CURRENT-LOAD-TASKS-REVERSE-EXACT","vertical":"class-sweep"} */';
const mutateCurrentLoadLeaf = (text, mutate) => {
  const parsed = JSON.parse(text);
  const leaf = parsed.leaves.find((row) => row.id === "unit.profile.current_load");
  mutate(leaf);
  return JSON.stringify(parsed);
};

function audit(s) {
  const failures = [];
  if (!/<EntityPicker[\s\S]{0,160}kind="unit"/.test(s.creator) || !/unit_id: unitId \|\| undefined/.test(s.creator)) failures.push("canonical unit picker-to-payload path missing");
  if ((s.service.match(/E_UNIT_NOT_FOUND/g) ?? []).length < 2 || (s.service.match(/deactivated_at IS NULL/g) ?? []).length < 2) failures.push("both create paths must reject missing, foreign, or inactive units");
  if (!/COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$2/.test(s.service) || !/COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/.test(s.service)) failures.push("both unit validations must be company scoped");
  if (!/assigned_unit_id = COALESCE\(\$3, assigned_unit_id\)/.test(s.service) || !/previous_unit_id, new_unit_id/.test(s.service)) failures.push("canonical unit FK sinks missing");
  if (!/const assignmentUpdate = await client\.query<\{ id: string \}>\([\s\S]{0,650}AND operating_company_id = \$6::uuid[\s\S]{0,120}RETURNING id[\s\S]{0,500}input\.operating_company_id[\s\S]{0,180}if \(!assignmentUpdate\.rows\[0\]\?\.id\) throw new Error\("E_LOAD_NOT_FOUND"\)/.test(s.service)) failures.push("combined driver/unit quick-assign write must bind company and prove the row changed");
  if (!/code === "E_UNIT_NOT_FOUND"[\s\S]{0,120}status: 404/.test(s.routes)) failures.push("unit rejection route mapping missing");
  if (!/l\.assigned_unit_id = \$1::uuid/.test(s.aggregate) || !/l\.operating_company_id = \$2::uuid/.test(s.aggregate)) failures.push("exact entity-scoped unit reverse query missing");
  if (!/l\.status::text NOT IN \('delivered', 'cancelled', 'void', 'completed', 'closed'\)/.test(s.aggregate)) failures.push("unit current-load reverse must exclude every terminal load state, including closed");
  // Independently converged fix — kept this already-integrated version (also strengthened the
  // load-drill check to require EntityLinkOrTombstone explicitly, which CC-2's narrower re-anchor
  // did not touch).
  if (!/EntityLinkOrTombstone[\s\S]{0,120}kind="load"/.test(s.reverse) || !/Available — no active load assigned to unit/.test(s.reverse)) failures.push("canonical unresolved-safe load drill or honest empty state missing");
  if (!/unitNumber:\s*string/.test(s.reverse) || !/EntityLinkOrTombstone[\s\S]{0,120}kind="unit"[\s\S]{0,120}name=\{unitNumber\}/.test(s.reverse)) failures.push("empty-state unit reverse must consume canonical unit number through unresolved-safe drill");
  if (!/CurrentLoadSection currentLoad=\{profile\.current_load\} unitId=\{id\} unitNumber=\{unitNumber\}/.test(s.profile)) failures.push("unit profile reverse mount must forward canonical unit number");
  let matrix;
  try { matrix = JSON.parse(s.matrix); } catch (error) { failures.push(`Fleet matrix parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((row) => row.id === "unit.profile.current_load");
  if (!leaf?.required?.includes("reverse_link")) failures.push("unit.profile.current_load must require reverse_link");
  if (leaf?.route_hint !== "/fleet/units/:id") failures.push("unit.profile.current_load must name mounted route /fleet/units/:id");
  if (!s.self.split('import fs from "node:fs";')[0].includes(HEADER)) failures.push("exact Fleet current-load header missing");
  try { if (JSON.parse(s.feed).entries?.some((entry) => entry.guard === files.self)) failures.push("manual feed duplicates Fleet current-load ownership"); }
  catch (error) { failures.push(`feed parse: ${error.message}`); }
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
    ["write-scope", "service", /AND operating_company_id = \$6::uuid/, ""],
    ["write-result", "service", /if \(!assignmentUpdate\.rows\[0\]\?\.id\)/, "if (false)"],
    ["route", "routes", /code === "E_UNIT_NOT_FOUND"/, 'code === "E_UNKNOWN"'],
    ["reverse", "aggregate", /l\.assigned_unit_id = \$1::uuid/g, "TRUE"],
    ["closed-terminal", "aggregate", /, 'closed'\)/, ")"],
    ["drill", "reverse", /EntityLinkOrTombstone kind="load"/, 'EntityLinkOrTombstone kind="unit"'],
    ["label-contract", "reverse", /unitNumber:\s*string/, "unitNumber?: string"],
    ["label-consumer", "reverse", /name=\{unitNumber\}/, "name={null}"],
    ["label-parent", "profile", / unitNumber=\{unitNumber\}/, ""],
    ["header", "self", new RegExp(HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')],
    ["feed", "feed", /^.*$/s, JSON.stringify({ entries: [{ guard: files.self }] })],
  ];
  const evidenceMutants = [
    { ...source, matrix: mutateCurrentLoadLeaf(source.matrix, (leaf) => { leaf.id += ".broken"; }) },
    { ...source, matrix: mutateCurrentLoadLeaf(source.matrix, (leaf) => { leaf.required = leaf.required.filter((col) => col !== "reverse_link"); }) },
    { ...source, matrix: mutateCurrentLoadLeaf(source.matrix, (leaf) => { leaf.route_hint = "/broken"; }) },
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
  }
  evidenceMutants.forEach((mutation, index) => { if (!audit(mutation).length) { console.error(`${LABEL} SELFTEST FAIL — matrix evidence ${index + 1}`); process.exit(1); } });
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + evidenceMutants.length}/${mutations.length + evidenceMutants.length} runtime/evidence mutations detected`);
  process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit picker→active tenant validation→load FK→exact profile reverse`);
