#!/usr/bin/env node
/** Insurance policy creators must use the shared company-scoped unit server-search chain. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-policy-create-unit-server-search";
const FILES = {
  wizard: "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx",
  modal: "apps/frontend/src/components/insurance/PolicyCreateModal.tsx",
  picker: "apps/frontend/src/components/parity/EntityPicker.tsx",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
};

function read(root, rel, overrides) {
  if (Object.hasOwn(overrides, rel)) return overrides[rel];
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}
const clean = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function collectProblems(root = ROOT, overrides = {}) {
  const problems = [];
  const source = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(root, rel, overrides)]));
  for (const [key, rel] of Object.entries(FILES)) if (!source[key]) problems.push(`missing ${rel}`);
  if (problems.length) return problems;

  for (const key of ["wizard", "modal"]) {
    const code = clean(source[key]);
    if (!/<EntityPicker[\s\S]{0,220}?kind=["']unit["']/.test(code)) problems.push(`${FILES[key]}: must use EntityPicker kind=unit`);
    if (/\blistUnits\s*\(/.test(code)) problems.push(`${FILES[key]}: must not fork the shared unit roster/search`);
  }

  const picker = clean(source.picker);
  if (!/config\.serverSearch\s*\?\s*rosterSearch/.test(picker)) problems.push(`${FILES.picker}: query key must include rosterSearch`);
  if (!/config\.serverSearch\s*\?\s*\{\s*search:\s*rosterSearch\s*\|\|\s*undefined\s*\}/.test(picker)) problems.push(`${FILES.picker}: list call must receive rosterSearch`);
  if (!/onSearch=\{config\.serverSearch\s*\?\s*setRosterSearch\s*:\s*undefined\}/.test(picker)) problems.push(`${FILES.picker}: Combobox must drive rosterSearch`);

  const registry = clean(source.registry);
  const start = registry.indexOf("unit: {");
  const end = registry.indexOf("load: {", start + 1);
  const unit = start >= 0 && end > start ? registry.slice(start, end) : "";
  if (!/serverSearch:\s*true/.test(unit)) problems.push(`${FILES.registry}: unit must enable serverSearch`);
  if (!/listUnits\s*\([\s\S]{0,220}?search:\s*opts\?\.search\s*\|\|\s*undefined/.test(unit)) problems.push(`${FILES.registry}: unit must forward search to listUnits`);
  return problems;
}

function selftest() {
  const baseline = Object.fromEntries(Object.values(FILES).map((rel) => [rel, read(ROOT, rel, {})]));
  const mutateUnit = (source, pattern, replacement) => {
    const start = source.indexOf("unit: {");
    const end = source.indexOf("load: {", start + 1);
    if (start < 0 || end <= start) return source;
    return source.slice(0, start) + source.slice(start, end).replace(pattern, replacement) + source.slice(end);
  };
  const mutations = [
    [FILES.wizard, /kind="unit"/, 'kind="driver"'],
    [FILES.modal, /kind="unit"/, 'kind="driver"'],
    [FILES.picker, /config\.serverSearch \? rosterSearch : ""/, '""'],
    [FILES.picker, /search: rosterSearch \|\| undefined/, "search: undefined"],
    [FILES.picker, /onSearch=\{config\.serverSearch \? setRosterSearch : undefined\}/, "onSearch={undefined}"],
    [FILES.registry, (source) => mutateUnit(source, /serverSearch: true/, "serverSearch: false")],
    [FILES.registry, (source) => mutateUnit(source, /search: opts\?\.search \|\| undefined/, "search: undefined")],
  ];
  const failures = [];
  if (collectProblems(ROOT, baseline).length) failures.push("current baseline is red");
  for (const [rel, pattern, replacement] of mutations) {
    const changed = typeof pattern === "function" ? pattern(baseline[rel]) : baseline[rel].replace(pattern, replacement);
    if (changed === baseline[rel]) failures.push(`mutation did not change ${rel}`);
    else if (!collectProblems(ROOT, { ...baseline, [rel]: changed }).length) failures.push(`mutation escaped: ${rel}`);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} independent mutations rejected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL} PASS — both policy creators use the shared unit server-search chain`);
}
