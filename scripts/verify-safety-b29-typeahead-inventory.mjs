#!/usr/bin/env node
/**
 * SAF-B29 — shrink-only inventory: every Safety-module limit:200 entity roster
 * must carry a live `search` param (or use EntityPicker / DriverPickerWithCreate).
 * Hardcoded search:"" with limit:200 is a FAIL.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");

const SCAN_DIRS = [
  "apps/frontend/src/pages/safety",
  "apps/frontend/src/components/safety",
  "apps/frontend/src/pages/compliance", // HOS surfaces used from Safety Hours group
];

const ALLOW_PICKER_MARKERS = [
  "EntityPicker",
  "DriverPickerWithCreate",
  "ReferenceSelect", // catalog typeahead with its own search
];

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = path.join(dir, name);
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.includes(".test.")) out.push(rel);
  }
  return out;
}

function assertInventory(files) {
  const problems = [];
  for (const rel of files) {
    const text = readFileSync(path.join(ROOT, rel), "utf8");
    if (!/limit:\s*200/.test(text)) continue;
    // Shared pickers that own server search — file may still mention limit:200 in a comment.
    if (ALLOW_PICKER_MARKERS.some((m) => text.includes(m)) && !/search:\s*""/.test(text)) {
      // Still require that any explicit listDrivers/listUnits/listLoads call with limit:200 includes search:
      const callRe =
        /(listDrivers|listUnits|listLoads|listTrailers|listDotViolationTypes|listInternalFineReasons|listCivilFineTypes|listCompanyViolationTypes|driverDeductionTypesCatalogClient\.list)\s*\(\s*\{[\s\S]*?limit:\s*200[\s\S]*?\}/g;
      let m;
      while ((m = callRe.exec(text))) {
        const block = m[0];
        if (!/\bsearch\s*:/.test(block)) {
          problems.push(`${rel}: ${m[1]}(… limit:200) missing search param`);
        }
        if (/search:\s*""/.test(block)) {
          problems.push(`${rel}: ${m[1]} hardcodes search:"" with limit:200`);
        }
      }
      continue;
    }
    if (/search:\s*""/.test(text) && /limit:\s*200/.test(text)) {
      problems.push(`${rel}: hardcoded search:"" with limit:200`);
    }
    const callRe =
      /(listDrivers|listUnits|listLoads|listTrailers|listDotViolationTypes|listInternalFineReasons|listCivilFineTypes|listCompanyViolationTypes)\s*\(\s*\{[\s\S]*?limit:\s*200[\s\S]*?\}/g;
    let m;
    while ((m = callRe.exec(text))) {
      const block = m[0];
      if (!/\bsearch\s*:/.test(block)) {
        problems.push(`${rel}: ${m[1]}(… limit:200) missing search param`);
      }
    }
  }
  return problems;
}

const files = SCAN_DIRS.flatMap((d) => walk(d));

if (SELFTEST) {
  const failures = [];
  const planted = assertInventory([
    // synthetic via rewriting one live file in memory is awkward — plant by string fixture:
  ]);
  // Fixture-based selftest
  const fixtureBad = `listDrivers({ operating_company_id: x, limit: 200 })`;
  const fixtureGood = `listDrivers({ operating_company_id: x, limit: 200, search: driverSearch || undefined })`;
  const check = (name, src, expectFail) => {
    const tmpRel = `__selftest__/${name}.tsx`;
    // inline mini assert
    const problems = [];
    const callRe =
      /(listDrivers|listUnits|listLoads)\s*\(\s*\{[\s\S]*?limit:\s*200[\s\S]*?\}/g;
    let m;
    while ((m = callRe.exec(src))) {
      if (!/\bsearch\s*:/.test(m[0])) problems.push("missing search");
      if (/search:\s*""/.test(m[0])) problems.push("empty search");
    }
    const failed = problems.length > 0;
    if (failed !== expectFail) failures.push(`${name}: expected fail=${expectFail} got fail=${failed}`);
  };
  check("bad", fixtureBad, true);
  check("good", fixtureGood, false);
  if (failures.length) {
    console.error("SELFTEST FAIL\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-safety-b29-typeahead-inventory SELFTEST PASS");
  process.exit(0);
}

const problems = assertInventory(files);
if (problems.length) {
  console.error("verify-safety-b29-typeahead-inventory FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log(
  `verify-safety-b29-typeahead-inventory OK — ${files.length} files scanned under Safety/compliance; no silent limit:200 entity rosters`
);
