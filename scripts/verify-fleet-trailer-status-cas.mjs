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

function routeBody(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return "";
  return source.slice(startIndex, endIndex);
}

function failuresFor(src) {
  const failures = [];
  const equipmentStatusRoute = routeBody(
    src.equipment,
    'app.post("/api/v1/mdata/equipment/:id/status-change"',
    'app.patch("/api/v1/mdata/equipment/:id"'
  );
  const trailerStatusRoute = routeBody(
    src.trailer,
    'app.put("/api/v1/fleet/trailers/:id/status"',
    'app.patch("/api/v1/fleet/trailers/:id"'
  );
  const checks = [
    ["mdata status route is mounted", Boolean(equipmentStatusRoute)],
    ["fleet alias status route is mounted", Boolean(trailerStatusRoute)],
    ["mdata status update compares source status", /UPDATE mdata\.equipment[\s\S]{0,500}AND status = \$6::mdata\.equipment_status[\s\S]{0,250}oldRow\.status/.test(equipmentStatusRoute)],
    ["mdata status conflict is explicit", /updated\.kind === "conflict"[\s\S]{0,120}reply\.code\(409\)[\s\S]{0,120}mdata_equipment_state_changed/.test(equipmentStatusRoute)],
    ["fleet alias appends source status", /values\.push\(oldRow\.status\);\s*const expectedStatusIdx = values\.length;/.test(trailerStatusRoute)],
    ["fleet alias status update compares source status", /UPDATE mdata\.equipment[\s\S]{0,900}AND status = \$\$\{expectedStatusIdx\}::mdata\.equipment_status/.test(trailerStatusRoute)],
    ["fleet alias refuses zero-row transition before audit", /const row = res\.rows\[0\];\s*if \(!row\) return \{ kind: "conflict" as const \};[\s\S]{0,160}appendCrudAudit/.test(trailerStatusRoute)],
    ["fleet alias status conflict is explicit", /updated\.kind === "conflict"[\s\S]{0,120}reply\.code\(409\)[\s\S]{0,120}mdata_equipment_state_changed/.test(trailerStatusRoute)],
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
