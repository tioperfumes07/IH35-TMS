#!/usr/bin/env node
/**
 * verify-step 12061 -- ROUND 313 CC-1 #1 E-17 FLEET ROSTER INTEGRITY.
 * FAILS IF: the migration's rule_code CHECK and the engine's ROSTER_RULES disagree; fleet.roster_findings loses
 * FORCE RLS or gains a DELETE grant; the engine deletes findings instead of resolving them; the cron / routes /
 * screen route / engine-board probe are unwired; staleness reads samsara_vehicles.last_seen_at alone (measured
 * 2026-10-01: it is not refreshed by the live ingest).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-fleet-roster-integrity";
const P = {
  mig: "db/migrations/202615180100_fleet_roster_findings.sql",
  svc: "apps/backend/src/fleet/roster-integrity.service.ts",
  idx: "apps/backend/src/index.ts",
  cat: "apps/backend/src/system/engine-status.catalog.ts",
  man: "apps/frontend/src/routes/manifest.tsx",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src) {
  const p = [];
  const migRules = [...(src.mig.match(/rule_code IN \(([\s\S]*?)\)\)/)?.[1] ?? "").matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  const svcRules = [...(src.svc.match(/export const ROSTER_RULES = \{([\s\S]*?)\} as const;/)?.[1] ?? "").matchAll(/^\s+([A-Z_]+):/gm)].map((m) => m[1]).sort();
  if (!migRules.length || JSON.stringify(migRules) !== JSON.stringify(svcRules)) p.push(`rule codes differ: migration [${migRules}] vs engine [${svcRules}]`);
  if (!/FORCE ROW LEVEL SECURITY/.test(src.mig)) p.push(`${P.mig}: FORCE RLS missing.`);
  if (/GRANT[^;]*DELETE[^;]*fleet\.roster_findings/i.test(src.mig)) p.push(`${P.mig}: DELETE granted -- findings are void-not-delete.`);
  if (/DELETE FROM fleet\.roster_findings/i.test(src.svc)) p.push(`${P.svc}: engine deletes findings.`);
  if (!/SET resolved_at = now\(\)/.test(src.svc)) p.push(`${P.svc}: findings no longer resolve when the mismatch clears.`);
  if (!/telematics\.vehicle_locations/.test(src.svc)) p.push(`${P.svc}: staleness no longer reads real positions (vehicle_locations).`);
  if (!/registerRosterIntegrityRoutes\(app\)/.test(src.idx) || !/initializeRosterIntegrityCron\(app\)/.test(src.idx)) p.push(`${P.idx}: roster routes or cron not wired.`);
  if (!/id: "E-17",[\s\S]{0,700}relation: "fleet\.roster_findings"[\s\S]{0,200}kind: "engine"/.test(src.cat)) p.push(`${P.cat}: E-17 engine-board probe on fleet.roster_findings missing.`);
  if (!/path="\/fleet\/roster-integrity"/.test(src.man)) p.push(`${P.man}: /fleet/roster-integrity route missing.`);
  return p;
}
const real = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, s, f) => { const pr = check(s); if ((pr.length > 0) !== f) { console.error(`SELFTEST FAIL: ${n}: ${JSON.stringify(pr)}`); ok = false; } };
  ex("real", real, false);
  ex("delete grant", { ...real, mig: real.mig.replace("GRANT SELECT, INSERT, UPDATE ON fleet.roster_findings", "GRANT SELECT, INSERT, UPDATE, DELETE ON fleet.roster_findings") }, true);
  ex("engine deletes", { ...real, svc: real.svc + "\n// DELETE FROM fleet.roster_findings WHERE true" }, true);
  ex("rule drift", { ...real, svc: real.svc.replace("  IRP_EXPIRED:", "  IRP_LAPSED:") }, true);
  ex("probe unwired", { ...real, cat: real.cat.replace('relation: "fleet.roster_findings"', 'relation: "x.y"') }, true);
  console.log(ok ? `${LABEL} --selftest PASS (5/5)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = check(real);
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- E-17 engine, findings table (RLS forced, void-not-delete), cron, routes, screen and board probe wired.`);
