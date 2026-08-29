#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = "apps/backend/src/dispatch/load-geofence-timeline.routes.ts";
const source = fs.readFileSync(path.join(root, rel), "utf8");

function failures(text) {
  const checks = [
    ["terminal numeric stop parser", text.includes("CAST(SUBSTRING(g.label FROM '-stop-([0-9]+)$') AS integer) AS sequence_number")],
    ["exact selected-company geofence join", text.includes("ge.operating_company_id = $1::uuid")],
    ["exact selected-company geofence filter", text.includes("g.operating_company_id = $1::uuid")],
    ["exact load label prefix", text.includes("`load-${loadId}-stop-%`")],
    ["retired hyphen-unsafe parser absent", !text.includes("REGEXP_REPLACE(g.label, '^load-[^-]+-stop-'")],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const normal = failures(source);
if (normal.length) {
  console.error(`verify-load-geofence-timeline-label-parser FAIL: ${normal.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drop numeric suffix parser", "CAST(SUBSTRING(g.label FROM '-stop-([0-9]+)$') AS integer)", "CAST(g.label AS integer)"],
    ["drop event company scope", "ge.operating_company_id = $1::uuid", "TRUE"],
    ["drop geofence company scope", "g.operating_company_id = $1::uuid", "TRUE"],
    ["widen load prefix", "`load-${loadId}-stop-%`", '"load-%"'],
    ["restore UUID-unsafe parser", "CAST(SUBSTRING(g.label FROM '-stop-([0-9]+)$') AS integer)", "CAST(REGEXP_REPLACE(g.label, '^load-[^-]+-stop-', '') AS integer)"],
  ];
  for (const [name, from, to] of mutations) {
    if (!source.includes(from)) throw new Error(`selftest fixture missing: ${name}`);
    if (failures(source.replaceAll(from, to)).length === 0) throw new Error(`selftest survived: ${name}`);
  }
  console.log(`verify-load-geofence-timeline-label-parser --selftest PASS ${mutations.length}/${mutations.length}`);
}

console.log("verify-load-geofence-timeline-label-parser PASS — UUID load labels resolve their terminal stop sequence under exact company/load scope");
