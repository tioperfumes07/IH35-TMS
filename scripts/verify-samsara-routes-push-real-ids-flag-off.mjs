#!/usr/bin/env node
/**
 * ROUND 306 E-31 — GUARD.
 * FAILS IF:
 *   1. a route is sent with ih35Unit:/ih35Driver:/ih35Stop: pseudo-ids Samsara does not have;
 *   2. a stop is sent without its own coordinates (singleUseLocation from load_stops lat/lng);
 *   3. anything POSTs/PATCHes a route to Samsara without SAMSARA_ROUTES_PUSH_ENABLED=true;
 *   4. an unchanged route is re-sent (body-hash ledger).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const F = {
  svc: "apps/backend/src/integrations/samsara/routes-integration.service.ts",
  client: "apps/backend/src/integrations/samsara/samsara-client.ts",
  cron: "apps/backend/src/integrations/samsara/routes-push.cron.ts",
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(src) {
  const p = [];
  const svc = stripComments(src.svc);
  const client = stripComments(src.client);
  const up = client.slice(client.indexOf("async upsertRoute("));
  if (/`ih35Unit:|`ih35Driver:|'ih35Stop:' \|\|/.test(up + svc)) p.push("a route still carries ih35 pseudo-ids Samsara does not have.");
  if (!/vehicleId: input\.samsaraVehicleId/.test(up)) p.push("upsertRoute no longer sends Samsara's own vehicle id.");
  if (!/if \(!Number\.isFinite\(lat\) \|\| !Number\.isFinite\(lng\)\) return \{[^}]*reason: "stop_without_coordinates"/.test(svc)) p.push("a stop without coordinates is no longer skipped.");
  if (!/process\.env\.SAMSARA_ROUTES_PUSH_ENABLED === "true"/.test(svc)) p.push("SAMSARA_ROUTES_PUSH_ENABLED is no longer default OFF.");
  const push = svc.slice(svc.indexOf("export async function pushLeaseScopedDispatchedRoute("));
  if (!/if \(!samsaraRoutesPushEnabled\(\)\) throw/.test(push)) p.push("the manual push endpoint can send without the flag.");
  if (!/if \(!samsaraRoutesPushEnabled\(\)\) \{/.test(stripComments(src.cron))) p.push("the cron can schedule without the flag.");
  if (!/=== item\.body_hash\) return \{ load_id: item\.load_id, outcome: "unchanged" \}/.test(svc)) p.push("an unchanged route can be re-sent.");
  return p;
}

const load = () => Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(resolve(ROOT, f), "utf8")]));

function selftest() {
  const g = load();
  const mut = (k, a, b) => ({ ...g, [k]: g[k].split(a).join(b) });
  const cases = [
    [g, false],
    [mut("client", "vehicleId: input.samsaraVehicleId", "vehicleId: `ih35Unit:${input.unitId}`"), true],
    [mut("svc", 'reason: "stop_without_coordinates"', 'reason: "x"'), true],
    [mut("svc", 'process.env.SAMSARA_ROUTES_PUSH_ENABLED === "true"', 'process.env.SAMSARA_ROUTES_PUSH_ENABLED !== "false"'), true],
    [mut("cron", "if (!samsaraRoutesPushEnabled()) {", "if (false) {"), true],
    [mut("svc", '=== item.body_hash) return { load_id: item.load_id, outcome: "unchanged" }', '=== "x") return { load_id: item.load_id, outcome: "unchanged" }'), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-routes-push-real-ids-flag-off selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-samsara-routes-push-real-ids-flag-off FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-routes-push-real-ids-flag-off: OK -- Samsara's own ids, stops from real coordinates, flag-OFF, no re-send of unchanged routes.");
  process.exit(p.length ? 1 : 0);
}
