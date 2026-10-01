#!/usr/bin/env node
/**
 * ROUND 306 E-29 — GUARD.
 * FAILS IF:
 *   1. normalizeVertices stops reading GeoJSON [lng, lat] vertices (342 live fences — every DOT station and
 *      border fence — would silently never fire again);
 *   2. the auto-status worker can write mdata.loads.status without AUTO_STATUS_SWITCH_APPLY=true;
 *   3. the border detector hard-codes a direction or filters loads by statuses mdata.loads never carries.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const F = {
  geo: "apps/backend/src/telematics/geofence.ts",
  auto: "apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts",
  border: "apps/backend/src/integrations/samsara/border-crossings/detector.service.ts",
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(src) {
  const p = [];
  const g = stripComments(src.geo);
  if (!/if \(Array\.isArray\(entry\)\)/.test(g) || !/const lng = typeof entry\[0\] === "number"/.test(g) || !/const lat = typeof entry\[1\] === "number"/.test(g)) p.push("normalizeVertices no longer reads GeoJSON [lng, lat] vertices.");
  const a = stripComments(src.auto);
  const body = a.slice(a.indexOf("export async function processDriftForLoad("));
  if (!/if \(!autoStatusApplyEnabled\(\)\)/.test(body) || body.indexOf("autoStatusApplyEnabled()") > body.indexOf("await applyAutoSwitch(")) p.push("the auto-status worker can write load status without AUTO_STATUS_SWITCH_APPLY.");
  if (!/process\.env\.AUTO_STATUS_SWITCH_APPLY === "true"/.test(a)) p.push("AUTO_STATUS_SWITCH_APPLY is no longer default OFF.");
  const b = stripComments(src.border);
  if (/ev\.direction, ev\.recorded_at/.test(b) || !/ev\.lat > prevLat \? "northbound" : "southbound"/.test(b)) p.push("the border detector no longer measures direction.");
  if (/IN \('assigned','in_transit'\)/.test(b)) p.push("the border detector filters loads by statuses mdata.loads never carries.");
  return p;
}

const load = () => Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(resolve(ROOT, f), "utf8")]));

function selftest() {
  const g = load();
  const mut = (k, a, b) => ({ ...g, [k]: g[k].split(a).join(b) });
  const cases = [
    [g, false],
    [mut("geo", "if (Array.isArray(entry))", "if (false)"), true],
    [mut("auto", "if (!autoStatusApplyEnabled())", "if (false)"), true],
    [mut("auto", 'process.env.AUTO_STATUS_SWITCH_APPLY === "true"', 'process.env.AUTO_STATUS_SWITCH_APPLY !== "false"'), true],
    [mut("border", "direction, ev.recorded_at", "ev.direction, ev.recorded_at"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-e29-fences-fire-and-status-switch-flag-off selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-e29-fences-fire-and-status-switch-flag-off FAILED:\n  - ${p.join("\n  - ")}` : "verify-e29-fences-fire-and-status-switch-flag-off: OK -- GeoJSON fences fire, load-status writes flag-OFF, border direction measured.");
  process.exit(p.length ? 1 : 0);
}
