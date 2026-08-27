#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/backend/src/fuel/planner.routes.ts");

function failuresFor(source) {
  const get = source.match(/app\.get\("\/api\/v1\/fuel\/planner\/settings"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const patch = source.match(/app\.patch\("\/api\/v1\/fuel\/planner\/settings"[\s\S]*?\n  \}\);/)?.[0] ?? "";
  const checks = [
    ["GET reads the scoped canonical settings row", /FROM fuel\.fuel_planner_settings[\s\S]{0,100}operating_company_id = \$1::uuid[\s\S]{0,60}LIMIT 1/.test(get)],
    ["GET contains no mutation SQL", !/\b(?:INSERT|UPDATE|DELETE)\b[\s\S]{0,80}fuel\.fuel_planner_settings/.test(get)],
    ["GET returns explicit non-persisted defaults", /res\.rows\[0\] \?\? \{[\s\S]{0,420}max_miles_per_shift: 720[\s\S]{0,180}overfill_threshold_pct: 95/.test(get)],
    ["PATCH remains the canonical create/write path", /INSERT INTO fuel\.fuel_planner_settings[\s\S]{0,160}ON CONFLICT \(operating_company_id\) DO NOTHING/.test(patch) && /UPDATE fuel\.fuel_planner_settings/.test(patch)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = failuresFor(source);
if (failures.length) {
  console.error(`FAIL verify-fuel-planner-settings-get-readonly: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("FROM fuel.fuel_planner_settings", "FROM fuel.route_recommendations"),
    source.replace("SELECT operating_company_id,", "INSERT INTO fuel.fuel_planner_settings (operating_company_id) VALUES ($1) RETURNING operating_company_id,"),
    source.replace("max_miles_per_shift: 720", "max_miles_per_shift: 0"),
    source.replace("ON CONFLICT (operating_company_id) DO NOTHING", "ON CONFLICT (operating_company_id) DO UPDATE SET operating_company_id = EXCLUDED.operating_company_id"),
  ];
  const missed = mutations.map((mutation, index) => ({ index, failures: failuresFor(mutation) })).filter((entry) => entry.failures.length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL verify-fuel-planner-settings-get-readonly: missed ${missed.map((entry) => entry.index + 1).join(",")}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS verify-fuel-planner-settings-get-readonly: caught ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

console.log("PASS verify-fuel-planner-settings-get-readonly: settings GET is pure and PATCH exclusively persists defaults/changes.");
