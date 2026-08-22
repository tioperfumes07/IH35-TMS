#!/usr/bin/env node
/** @matrix-built {"modules":["legal","fleet"],"cols":["trailer","connectivity","picker_law"],"leafRe":"^matters\\.(list|create|detail)$|^trailer\\.profile\\.legal_reverse$","task":"THEATER-LEGAL-MATTER-TRAILER-LEAFRE","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.legal_reverse","trailer.profile.legal_reverse"],"task":"FLEET-F5910-LEGAL-MATTERS-REVERSE-EXACT","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.legal_reverse","trailer.profile.legal_reverse"],"task":"FLEET-F5941-LEGAL-MATTERS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";

const LABEL = "verify-legal-matter-trailer-linkage";
const files = {
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  service: "apps/backend/src/legal/matters.service.ts",
  routes: "apps/backend/src/legal/matters.routes.ts",
  detail: "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx",
  reverse: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
  unitReverse: "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
  reverseSection: "apps/frontend/src/components/legal/LegalMattersReverseSection.tsx",
  api: "apps/frontend/src/api/legal-matters.ts",
  matrix: "docs/specs/scoreboard/modules/fleet.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-legal-matter-trailer-linkage.mjs",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["unit.profile.legal_reverse","trailer.profile.legal_reverse"],"task":"FLEET-F5910-LEGAL-MATTERS-REVERSE-EXACT","vertical":"class-sweep"} */';
const CONNECTIVITY_HEADER = '/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["unit.profile.legal_reverse","trailer.profile.legal_reverse"],"task":"FLEET-F5941-LEGAL-MATTERS-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';
const mutateLeaf = (text, id, mutate) => {
  const parsed = JSON.parse(text);
  const leaf = parsed.leaves.find((row) => row.id === id);
  mutate(leaf);
  return JSON.stringify(parsed);
};

function audit(s) {
  const failures = [];
  if (!/data-testid="legal-matter-trailer-picker"[\s\S]{0,500}kind="trailer"/.test(s.form)) failures.push("create/edit form must expose canonical trailer picker");
  if (!/data-testid="legal-matter-trailer-picker"[\s\S]{0,500}allowCreate(?:\s|\/>)/.test(s.form)) failures.push("trailer picker must offer first-row canonical create");
  if (!/equipment_id:\s*optionalUuidOrNull\(form\.equipment_id\)/.test(s.form) || !/equipment_id:\s*matter\.equipment_id/.test(s.form)) failures.push("trailer FK must round-trip through form payload and reload");
  if (!/equipment_id,\s*\n\s*created_by_user_id/.test(s.service) || !/input\.equipment_id \?\? null/.test(s.service)) failures.push("create INSERT must persist equipment_id");
  if ((s.service.match(/assertEquipmentInCompany\(client, input\.equipment_id/g) ?? []).length < 2) failures.push("create and update must validate trailer before write");
  if (!/FROM mdata\.equipment[\s\S]{0,220}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.service)) failures.push("trailer validation must use canonical lease/owner company and active row");
  if (!/linked_entity_not_in_operating_company/.test(s.routes)) failures.push("routes must return explicit invalid-link response");
  if ((s.service.match(/eq\.equipment_number\s+AS equipment_number/g) ?? []).length < 2 || (s.service.match(/LEFT JOIN mdata\.equipment eq ON eq\.id = m\.equipment_id/g) ?? []).length < 2) failures.push("list and detail payloads must resolve trailer label");
  if (!/kind="trailer"[\s\S]{0,160}matter\.equipment_id[\s\S]{0,160}equipment_number/.test(s.detail)) failures.push("matter detail must drill to canonical trailer");
  if (!/filter=\{\{ equipment_id: id \}\}/.test(s.reverse)) failures.push("trailer profile must mount exact legal-matter reverse filter");
  if (!/LegalMattersReverseSection[\s\S]{0,180}filter=\{\{ unit_id: id \}\}/.test(s.unitReverse)) failures.push("unit profile must mount exact legal-matter reverse filter");
  if (!/equipment_id\?: string/.test(s.api) || !/params\.equipment_id = filters\.equipment_id/.test(s.api)) failures.push("client must forward exact equipment reverse filter");
  if (!/\{ equipment_id: string;/.test(s.reverseSection)) failures.push("reverse component must accept trailer equipment key space");
  if (!/const id = m\.id == null \? null : String\(m\.id\)/.test(s.reverseSection) || !/EntityLinkOrTombstone[\s\S]{0,180}kind="matter"[\s\S]{0,180}id=\{id\}[\s\S]{0,180}name=\{m\.matter_number\}/.test(s.reverseSection)) failures.push("reverse rows must drill to canonical matter ids and human labels");
  if (!/m\.unit_id = \$\$\{values\.length\}/.test(s.service) || !/m\.equipment_id = \$\$\{values\.length\}/.test(s.service)) failures.push("service must retain exact unit and trailer reverse filters");
  let matrix;
  try { matrix = JSON.parse(s.matrix); } catch (error) { failures.push(`Fleet matrix parse: ${error.message}`); }
  for (const [id, route] of [["unit.profile.legal_reverse", "/fleet/units/:id"], ["trailer.profile.legal_reverse", "/fleet/trailers/:id"]]) {
    const leaf = matrix?.leaves?.find((row) => row.id === id);
    if (!leaf?.required?.includes("reverse_link")) failures.push(`${id} must require reverse_link`);
    if (!leaf?.required?.includes("connectivity")) failures.push(`${id} must require connectivity`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  if (!s.self.split('import fs from "node:fs";')[0].includes(HEADER)) failures.push("exact Fleet legal-reverse header missing");
  if (!s.self.split('import fs from "node:fs";')[0].includes(CONNECTIVITY_HEADER)) failures.push("exact Fleet legal connectivity header missing");
  try { if (JSON.parse(s.feed).entries?.some((entry) => entry.guard === files.self)) failures.push("manual feed duplicates Fleet legal ownership"); }
  catch (error) { failures.push(`feed parse: ${error.message}`); }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "form", /kind="trailer"/, 'kind="unit"'],
    ["picker-create", "form", /(data-testid="legal-matter-trailer-picker"[\s\S]{0,500})allowCreate(?:\s|\/>)/, "$1allowCreate={false}\n"],
    ["payload", "form", /equipment_id:\s*optionalUuidOrNull\(form\.equipment_id\)/, "equipment_id: null"],
    ["insert", "service", /input\.equipment_id \?\? null/, "null"],
    ["validation", "service", /assertEquipmentInCompany\(client, input\.equipment_id/g, "skipEquipmentCheck(client, input.equipment_id"],
    ["scope", "service", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/, "TRUE"],
    ["label", "service", /eq\.equipment_number\s+AS equipment_number/g, "NULL AS equipment_number"],
    ["detail", "detail", /kind="trailer"/, 'kind="unit"'],
    ["reverse", "reverse", /filter=\{\{ equipment_id: id \}\}/, "filter={{ unit_id: id }}"],
    ["unit-reverse", "unitReverse", /filter=\{\{ unit_id: id \}\}/, "filter={{ equipment_id: id }}"],
    ["api", "api", /params\.equipment_id = filters\.equipment_id/, "params.unit_id = filters.equipment_id"],
    ["matter-drill", "reverseSection", /id=\{id\}/, "id={null}"],
    ["header", "self", new RegExp(HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')],
    ["connectivity-header", "self", new RegExp(CONNECTIVITY_HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), CONNECTIVITY_HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')],
    ["feed", "feed", /^.*$/s, JSON.stringify({ entries: [{ guard: files.self }] })],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  const matrixMutations = [];
  for (const id of ["unit.profile.legal_reverse", "trailer.profile.legal_reverse"]) {
    matrixMutations.push({ ...source, matrix: mutateLeaf(source.matrix, id, (leaf) => { leaf.id += ".broken"; }) });
    matrixMutations.push({ ...source, matrix: mutateLeaf(source.matrix, id, (leaf) => { leaf.route_hint = "/broken"; }) });
    matrixMutations.push({ ...source, matrix: mutateLeaf(source.matrix, id, (leaf) => { leaf.required = leaf.required.filter((column) => column !== "connectivity"); }) });
  }
  matrixMutations.forEach((mutation, index) => { if (!audit(mutation).length) { console.error(`${LABEL} SELFTEST FAIL — matrix mutation ${index + 1} escaped`); process.exit(1); } });
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length + matrixMutations.length}/${mutations.length + matrixMutations.length} runtime/evidence mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — trailer picker→payload→tenant writer→label/drill→exact reverse`);
