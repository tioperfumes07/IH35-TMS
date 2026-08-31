#!/usr/bin/env node
/** FLT-F6320 — The detailed fleet comparison control must reveal real API-backed values, never placeholder copy. */
import fs from "node:fs";

const FILE = "apps/frontend/src/components/vehicle-profile/ComparableUnitsWidget.tsx";
const source = fs.readFileSync(FILE, "utf8");

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(!/placeholder/i.test(text), "comparison must not render placeholder copy");
  need(/aria-expanded=\{open\}/.test(text) && /aria-controls="fleet-unit-comparison-detail"/.test(text), "toggle must expose expanded-state contract");
  need(/role="region"/.test(text) && /id="fleet-unit-comparison-detail"/.test(text), "detail must mount an accessible region");
  need(/comparable\.this_unit_maintenance_per_mile_cents/.test(text) && /comparable\.fleet_avg_maintenance_per_mile_cents/.test(text), "detail must compare unit and fleet maintenance cost");
  need(/comparable\.deviation_pct == null/.test(text), "detail must preserve unknown deviation rather than inventing zero");
  need(/comparable\.rank_in_fleet/.test(text) && /comparable\.total_units_in_fleet/.test(text), "detail must show rank denominator");
  need(/import \{ DataTable/.test(text) && /hideToolbar/.test(text) && /hidePager/.test(text), "embedded comparison must use the canonical DataTable without list chrome");
  need(!/<table/.test(text), "embedded comparison must not reintroduce a hand-rolled table");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-fleet-comparable-units-detail FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("aria-expanded={open}", "data-expanded={open}"),
    source.replace('role="region"', 'role="presentation"'),
    source.replaceAll("comparable.this_unit_maintenance_per_mile_cents", "null"),
    source.replaceAll("comparable.fleet_avg_maintenance_per_mile_cents", "null"),
    source.replace("comparable.deviation_pct == null", "false"),
    source.replaceAll("comparable.total_units_in_fleet", "null"),
    source.replace("<DataTable", "<table><tbody /></table><DataTable"),
    source.replace("import { DataTable", "import { RetiredTable"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (mutation === source || audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-comparable-units-detail SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-comparable-units-detail PASS — detailed unit comparison renders real values");
