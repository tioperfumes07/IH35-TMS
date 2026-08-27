#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  equipment: "apps/backend/src/mdata/equipment.routes.ts",
  trailer: "apps/backend/src/fleet/trailer.routes.ts",
};

function readSources(overrides = {}) {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, relative]) => [key, overrides[key] ?? fs.readFileSync(path.join(ROOT, relative), "utf8")])
  );
}

function failuresFor(src) {
  const failures = [];
  const checks = [
    ["mdata status update compares source status", /UPDATE mdata\.equipment[\s\S]{0,500}AND status = \$6::mdata\.equipment_status[\s\S]{0,250}oldRow\.status/.test(src.equipment)],
    ["mdata status conflict is explicit", /updated\.kind === "conflict"[\s\S]{0,120}reply\.code\(409\)[\s\S]{0,120}mdata_equipment_state_changed/.test(src.equipment)],
    ["fleet alias appends source status", /values\.push\(oldRow\.status\);\s*const expectedStatusIdx = values\.length;/.test(src.trailer)],
    ["fleet alias status update compares source status", /UPDATE mdata\.equipment[\s\S]{0,900}AND status = \$\$\{expectedStatusIdx\}::mdata\.equipment_status/.test(src.trailer)],
    ["fleet alias refuses zero-row transition before audit", /const row = res\.rows\[0\];\s*if \(!row\) return \{ kind: "conflict" as const \};[\s\S]{0,160}appendCrudAudit/.test(src.trailer)],
    ["fleet alias status conflict is explicit", /updated\.kind === "conflict"[\s\S]{0,120}reply\.code\(409\)[\s\S]{0,120}mdata_equipment_state_changed/.test(src.trailer)],
  ];
  for (const [name, ok] of checks) if (!ok) failures.push(name);
  return failures;
}

const source = readSources();
const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-fleet-trailer-status-cas: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { key: "equipment", find: "AND status = $6::mdata.equipment_status", replace: "AND true" },
    { key: "equipment", find: 'updated.kind === "conflict"', replace: 'updated.kind === "lost"' },
    { key: "trailer", find: "values.push(oldRow.status);", replace: "values.push(body.data.status);" },
    { key: "trailer", find: "AND status = $${expectedStatusIdx}::mdata.equipment_status", replace: "AND true" },
    { key: "trailer", find: 'if (!row) return { kind: "conflict" as const };', replace: 'if (!row) return { kind: "not_found" as const };' },
    { key: "trailer", find: 'updated.kind === "conflict"', replace: 'updated.kind === "lost"' },
  ];
  let caught = 0;
  for (const mutation of mutations) {
    if (!source[mutation.key].includes(mutation.find)) {
      console.error(`SELFTEST setup failure: missing mutation target ${mutation.key}:${mutation.find}`);
      process.exit(1);
    }
    const changed = { ...source, [mutation.key]: source[mutation.key].replace(mutation.find, mutation.replace) };
    if (failuresFor(changed).length) caught += 1;
  }
  if (caught !== mutations.length) {
    console.error(`SELFTEST FAIL verify-fleet-trailer-status-cas: caught ${caught}/${mutations.length}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-fleet-trailer-status-cas: caught ${caught}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-fleet-trailer-status-cas: both trailer status aliases enforce source-state CAS and explicit 409.");
