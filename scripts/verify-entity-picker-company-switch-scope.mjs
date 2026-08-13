#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","bank","compliance","customers","dispatch","docs","drivers","factoring","fleet","form_425","fuel","insurance","inventory","legal","lists","maintenance","reports","safety","settlements","tasks","vendors"],"cols":["customer","driver","load","trailer","unit","vendor","connectivity","picker_law"],"task":"SHARED-PICKER-COMPANY-SWITCH-SCOPE","leafRe":".*(picker|create|filter).*"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";
const TEST = "apps/frontend/src/components/parity/__tests__/EntityPicker.test.tsx";
const REFERENCE_SELECT = "apps/frontend/src/components/parity/ReferenceSelect.tsx";
const REFERENCE_TEST = "apps/frontend/src/components/parity/ReferenceSelect.test.tsx";

export function collectProblems({ picker, test, referenceSelect, referenceTest }) {
  const problems = [];
  const scopeEffect = picker.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[kind, onChange, operatingCompanyId, value\]\);/)?.[0] ?? "";
  const checks = [
    [/useRef\(\{ kind, operatingCompanyId \}\)/, "picker must remember its prior canonical roster scope", picker],
    [/previous\.kind === kind && previous\.operatingCompanyId === operatingCompanyId/, "scope comparison must include kind and operating company"],
    [/setCreated\(\[\]\)/, "company switch must evict locally-created cross-company options"],
    [/setRosterSearch\(""\)/, "company switch must clear the prior company's search term"],
    [/setCreateOpen\(false\)/, "company switch must close any create surface opened under the prior company"],
    [/if \(value\)[\s\S]{0,100}onChange\(null\)/, "company switch must clear the committed foreign key"],
    [/setInvalidatedValue\(value\)/, "picker must suppress a prior-company FK even if a legacy parent ignores null"],
    [/const scopedValue = value === invalidatedValue \? null : value/, "picker rendering must consume the company-safe value", picker],
  ];
  for (const [pattern, message, source = scopeEffect] of checks) if (!pattern.test(source)) problems.push(message);
  if (!/clears a locally created selection when the operating-company roster changes/.test(test)) {
    problems.push("runtime company-switch regression test is missing");
  }
  if (!/suppresses the prior-company FK even when a legacy parent ignores the null callback/.test(test)) {
    problems.push("stubborn-parent company-switch regression test is missing");
  }

  const referenceEffect = referenceSelect.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[createKind, onChange, operatingCompanyId, value\]\);/)?.[0] ?? "";
  const referenceChecks = [
    [/useRef\(\{ createKind, operatingCompanyId \}\)/, "ReferenceSelect must remember its prior canonical roster scope", referenceSelect],
    [/previous\.createKind === createKind && previous\.operatingCompanyId === operatingCompanyId/, "ReferenceSelect scope comparison must include kind and operating company"],
    [/rosterScope\.current = \{ createKind, operatingCompanyId \}/, "ReferenceSelect must advance its remembered scope after a company change"],
    [/setCreated\(\[\]\)/, "ReferenceSelect company switch must evict locally-created cross-company options"],
    [/setCreateOpen\(false\)/, "ReferenceSelect company switch must close the prior company's create drawer"],
    [/if \(value\)[\s\S]{0,100}onChange\(null\)/, "ReferenceSelect company switch must clear the committed foreign key"],
    [/setInvalidatedValue\(value\)/, "ReferenceSelect must suppress a prior-company FK when a controlled parent ignores null"],
    [/const scopedValue = value === invalidatedValue \? null : value/, "ReferenceSelect rendering must consume the company-safe value", referenceSelect],
  ];
  for (const [pattern, message, source = referenceEffect] of referenceChecks) if (!pattern.test(source)) problems.push(message);
  if (!/evicts a locally created row and committed FK when the company changes/.test(referenceTest)) {
    problems.push("ReferenceSelect runtime company-switch regression test is missing");
  }
  if (!/suppresses the prior-company FK when a controlled parent ignores null/.test(referenceTest)) {
    problems.push("ReferenceSelect stubborn-parent company-switch regression test is missing");
  }
  return problems;
}

const sources = {
  picker: fs.readFileSync(path.join(ROOT, PICKER), "utf8"),
  test: fs.readFileSync(path.join(ROOT, TEST), "utf8"),
  referenceSelect: fs.readFileSync(path.join(ROOT, REFERENCE_SELECT), "utf8"),
  referenceTest: fs.readFileSync(path.join(ROOT, REFERENCE_TEST), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, picker: sources.picker.replace("setCreated([]);", "") },
    { ...sources, picker: sources.picker.replace('setRosterSearch("");', "") },
    { ...sources, picker: sources.picker.replace("setCreateOpen(false);", "") },
    { ...sources, picker: sources.picker.replace("onChange(null);", "") },
    { ...sources, picker: sources.picker.replace("previous.operatingCompanyId === operatingCompanyId", "true") },
    { ...sources, test: sources.test.replace("clears a locally created selection when the operating-company roster changes", "deleted regression") },
    { ...sources, picker: sources.picker.replace("setInvalidatedValue(value);", "") },
    { ...sources, picker: sources.picker.replace("value === invalidatedValue ? null : value", "value") },
    { ...sources, test: sources.test.replace("suppresses the prior-company FK even when a legacy parent ignores the null callback", "deleted regression") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("rosterScope.current = { createKind, operatingCompanyId };", "") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("setCreated([]);", "") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("setCreateOpen(false);", "") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("onChange(null);", "") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("previous.operatingCompanyId === operatingCompanyId", "true") },
    { ...sources, referenceTest: sources.referenceTest.replace("evicts a locally created row and committed FK when the company changes", "deleted regression") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("setInvalidatedValue(value);", "") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("value === invalidatedValue ? null : value", "value") },
    { ...sources, referenceTest: sources.referenceTest.replace("suppresses the prior-company FK when a controlled parent ignores null", "deleted regression") },
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
console.log(`verify-entity-picker-company-switch-scope PASS — EntityPicker + ReferenceSelect state is company-bound${process.argv.includes("--selftest") ? "; 18 mutations caught" : ""}`);
