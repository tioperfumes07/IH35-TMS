#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","picker_law","connectivity","reverse_link"],"leafRe":"^(safety_meetings\\.(list|create)|training_programs\\.list|drug_alcohol\\.list)$","task":"SAF-DRIVER-EXACT-LABELS","vertical":"driver-linkage-class"} */
/**
 * SafetyMeetingsPage + TrainingProgramsPage driver rosters must use EntityPicker
 * (kind=driver), not Combobox/listDrivers limit:200 pages. Cursor even claim: 2412.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-meetings-training-entity-pickers";
const TARGETS = [
  "apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx",
  "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
];
const LABEL_TARGETS = [
  ...TARGETS,
  "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
];
const ROUTE = "apps/backend/src/mdata/driver-labels.routes.ts";
const API = "apps/frontend/src/api/mdata.ts";
const HOOK = "apps/frontend/src/hooks/useDriverLabels.ts";
const SELFTEST = process.argv.includes("--selftest");

export function collectProblems(src, target) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/EntityPicker/.test(src) || !/kind=["']driver["']/.test(code)) {
    problems.push(`${target}: driver must use EntityPicker kind=driver`);
  }
  if (/listDrivers\(/.test(code)) {
    problems.push(`${target}: must not local-fetch driver roster — EntityPicker owns search`);
  }
  if (!/useDriverLabels\s*\(/.test(code)) {
    problems.push(`${target}: persisted driver FKs must resolve through the exact label route`);
  }
  return problems;
}

export function collectContractProblems(parts) {
  const problems = [];
  if (!/operating_company_id[\s\S]*ids/.test(parts.route) || !/d\.operating_company_id\s*=\s*\$1::uuid/.test(parts.route)) {
    problems.push(`${ROUTE}: exact label lookup must bind company + requested driver ids`);
  }
  if (!/label_dca\.driver_id = d\.id[\s\S]{0,180}label_dca\.company_id = \$1::uuid[\s\S]{0,180}label_dca\.is_authorized = true[\s\S]{0,120}label_dca\.deactivated_at IS NULL/.test(parts.route)) {
    problems.push(`${ROUTE}: exact label lookup must preserve active company-authorized shared drivers`);
  }
  if (!/d\.id\s*=\s*ANY\(\$2::uuid\[\]\)/.test(parts.route)) problems.push(`${ROUTE}: must resolve requested FKs, not a paged roster`);
  if (/EXCLUDE_ARCHIVED_DRIVERS_SQL/.test(parts.route)) problems.push(`${ROUTE}: historical reverse labels must include archived drivers`);
  if (!/getDriverLabels/.test(parts.api) || !/driver-labels/.test(parts.api)) problems.push(`${API}: exact label client missing`);
  if (!/getDriverLabels/.test(parts.hook) || !/\["mdata",\s*"driver-labels"/.test(parts.hook)) problems.push(`${HOOK}: exact-ID query missing`);
  if (!/chunkDriverLabelIds\(ids\)/.test(parts.hook) || !/Promise\.all/.test(parts.hook)) problems.push(`${HOOK}: every linked ID must resolve without a silent 200-row cap`);
  for (const [target, source] of Object.entries(parts.targets)) {
    if (!/useDriverLabels\s*\(/.test(source)) problems.push(`${target}: exact driver-label resolver missing`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = `listDrivers({ limit: 200 })\n<input type="search" />`;
  const good = `<EntityPicker kind="driver" onChange={add} />; useDriverLabels(companyId, ids);`;
  const badP = collectProblems(bad, "stub.tsx");
  const goodP = collectProblems(good, "stub.tsx");
  if (badP.length < 2 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  const realParts = {
    route: fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
    api: fs.readFileSync(path.join(ROOT, API), "utf8"),
    hook: fs.readFileSync(path.join(ROOT, HOOK), "utf8"),
    targets: Object.fromEntries(LABEL_TARGETS.map((target) => [target, fs.readFileSync(path.join(ROOT, target), "utf8")])),
  };
  const mutations = [
    ["company scope", { ...realParts, route: realParts.route.replace("d.operating_company_id = $1::uuid", "TRUE") }],
    ["shared-driver authorization", { ...realParts, route: realParts.route.replace("label_dca.is_authorized = true", "label_dca.is_authorized = false") }],
    ["exact ids", { ...realParts, route: realParts.route.replace("d.id = ANY($2::uuid[])", "TRUE") }],
    ["silent cap", { ...realParts, hook: realParts.hook.replace("chunkDriverLabelIds(ids)", "[ids.slice(0, 200)]") }],
    ["consumer adoption", { ...realParts, targets: { ...realParts.targets, [LABEL_TARGETS[0]]: realParts.targets[LABEL_TARGETS[0]].replace("useDriverLabels(", "usePagedRoster(") } }],
  ];
  for (const [name, parts] of mutations) {
    if (collectContractProblems(parts).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const problems = [];
for (const target of TARGETS) {
  const abs = path.join(ROOT, target);
  const src = fs.readFileSync(abs, "utf8");
  problems.push(...collectProblems(src, target));
}
problems.push(...collectContractProblems({
  route: fs.readFileSync(path.join(ROOT, ROUTE), "utf8"),
  api: fs.readFileSync(path.join(ROOT, API), "utf8"),
  hook: fs.readFileSync(path.join(ROOT, HOOK), "utf8"),
  targets: Object.fromEntries(LABEL_TARGETS.map((target) => [target, fs.readFileSync(path.join(ROOT, target), "utf8")])),
}));
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Safety meeting/training/drug driver FKs use canonical pickers + exact entity-scoped reverse labels`);
