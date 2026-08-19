#!/usr/bin/env node
/**
 * HONEST-BUILT-LAUNCH-LAW 2026-08-14: class regression only — NO @matrix-built Box-3 credit.
 * Former leafRe `.*(picker|create).*` was theater.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  helper: "apps/frontend/src/components/parity/mergePickerOptionsByValue.ts",
  helperTest: "apps/frontend/src/components/parity/mergePickerOptionsByValue.test.ts",
  entityPicker: "apps/frontend/src/components/parity/EntityPicker.tsx",
  referenceSelect: "apps/frontend/src/components/parity/ReferenceSelect.tsx",
};

export function collectProblems(sources) {
  const problems = [];
  const requirePattern = (key, pattern, message) => {
    if (!pattern.test(sources[key])) problems.push(message);
  };
  requirePattern("helper", /for \(const option of \[\.\.\.canonical, \.\.\.optimistic\]\)/, "canonical roster must take precedence over optimistic rows");
  requirePattern("helper", /if \(seen\.has\(option\.value\)\) continue/, "shared merge must dedupe canonical ids");
  // CC-2 GUARD 2026-08-19: re-anchored — EntityPicker also now folds in a previously-selected
  // option before merging (keeps a scoped value visible even when it's not on the current roster
  // page), so `created` alone is no longer the second argument; the canonical-id merge call is
  // otherwise unchanged.
  requirePattern(
    "entityPicker",
    /mergePickerOptionsByValue\(\s*rosterQuery\.data \?\? \[\],\s*selectedOption \? \[selectedOption, \.\.\.created\] : created,?\s*\)/,
    "EntityPicker must use the shared canonical-id merge",
  );
  requirePattern("entityPicker", /const rosterShown = options\.length/, "EntityPicker cap notice must count unique visible rows");
  requirePattern("referenceSelect", /mergePickerOptionsByValue\(options, created\)/, "ReferenceSelect must use the shared canonical-id merge");
  requirePattern("helperTest", /Canonical Vendor[\s\S]*Optimistic Vendor[\s\S]*toEqual\(\[\{ value: "vendor-1", label: "Canonical Vendor" \}\]\)/, "runtime precedence regression test is missing");
  return problems;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));
if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...sources, helper: sources.helper.replace("[...canonical, ...optimistic]", "[...optimistic, ...canonical]") },
    { ...sources, helper: sources.helper.replace("if (seen.has(option.value)) continue;", "") },
    {
      ...sources,
      entityPicker: sources.entityPicker.replace(
        /mergePickerOptionsByValue\(\s*rosterQuery\.data \?\? \[\],\s*selectedOption \? \[selectedOption, \.\.\.created\] : created,?\s*\)/,
        "[...(rosterQuery.data ?? []), ...(selectedOption ? [selectedOption, ...created] : created)]",
      ),
    },
    { ...sources, entityPicker: sources.entityPicker.replace("const rosterShown = options.length", "const rosterShown = created.length") },
    { ...sources, referenceSelect: sources.referenceSelect.replace("mergePickerOptionsByValue(options, created)", "[...options, ...created]") },
    { ...sources, helperTest: sources.helperTest.replace("Canonical Vendor", "Deleted Canonical Proof") },
  ];
  const escaped = mutations.flatMap((mutation, index) => collectProblems(mutation).length ? [] : [index + 1]);
  if (escaped.length) {
    console.error(`verify-shared-picker-created-option-dedupe SELFTEST FAIL — mutations ${escaped.join(", ")} escaped`);
    process.exit(1);
  }
}

const problems = collectProblems(sources);
if (problems.length) {
  console.error("verify-shared-picker-created-option-dedupe FAIL");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verify-shared-picker-created-option-dedupe PASS — canonical ids render once with server precedence${process.argv.includes("--selftest") ? "; 6 mutations caught" : ""}`);
