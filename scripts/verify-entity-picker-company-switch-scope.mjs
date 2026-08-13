#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","bank","compliance","customers","dispatch","docs","drivers","factoring","fleet","form_425","fuel","insurance","legal","maintenance","reports","safety","settlements","tasks"],"cols":["driver","load","trailer","unit","vendor","connectivity","picker_law"],"task":"ENTITY-PICKER-COMPANY-SWITCH-SCOPE","leafRe":".*(picker|create|filter).*"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";
const TEST = "apps/frontend/src/components/parity/__tests__/EntityPicker.test.tsx";

export function collectProblems({ picker, test }) {
  const problems = [];
  const scopeEffect = picker.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[kind, onChange, operatingCompanyId, value\]\);/)?.[0] ?? "";
  const checks = [
    [/useRef\(\{ kind, operatingCompanyId \}\)/, "picker must remember its prior canonical roster scope", picker],
    [/previous\.kind === kind && previous\.operatingCompanyId === operatingCompanyId/, "scope comparison must include kind and operating company"],
    [/setCreated\(\[\]\)/, "company switch must evict locally-created cross-company options"],
    [/setRosterSearch\(""\)/, "company switch must clear the prior company's search term"],
    [/setCreateOpen\(false\)/, "company switch must close any create surface opened under the prior company"],
    [/if \(value\) onChange\(null\)/, "company switch must clear the committed foreign key"],
  ];
  for (const [pattern, message, source = scopeEffect] of checks) if (!pattern.test(source)) problems.push(message);
  if (!/clears a locally created selection when the operating-company roster changes/.test(test)) {
    problems.push("runtime company-switch regression test is missing");
  }
  return problems;
}

const sources = {
  picker: fs.readFileSync(path.join(ROOT, PICKER), "utf8"),
  test: fs.readFileSync(path.join(ROOT, TEST), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, picker: sources.picker.replace("setCreated([]);", "") },
    { ...sources, picker: sources.picker.replace('setRosterSearch("");', "") },
    { ...sources, picker: sources.picker.replace("setCreateOpen(false);", "") },
    { ...sources, picker: sources.picker.replace("if (value) onChange(null);", "") },
    { ...sources, picker: sources.picker.replace("previous.operatingCompanyId === operatingCompanyId", "true") },
    { ...sources, test: sources.test.replace("clears a locally created selection when the operating-company roster changes", "deleted regression") },
  ];
  const escaped = mutations.flatMap((mutation, index) => collectProblems(mutation).length ? [] : [index + 1]);
  if (escaped.length) {
    console.error(`verify-entity-picker-company-switch-scope SELFTEST FAIL — mutations ${escaped.join(", ")} escaped`);
    process.exit(1);
  }
}

const problems = collectProblems(sources);
if (problems.length) {
  console.error("verify-entity-picker-company-switch-scope FAIL");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verify-entity-picker-company-switch-scope PASS — shared picker state is company-bound${process.argv.includes("--selftest") ? "; 6 mutations caught" : ""}`);
