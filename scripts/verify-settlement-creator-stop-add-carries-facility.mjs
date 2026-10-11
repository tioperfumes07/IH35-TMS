#!/usr/bin/env node
/**
 * GUARD — Lead 443.43 (CC-3): the 11 multi-stop loads the Settlement Creator booked as two stops are repaired by adding
 * their missing stops through POST /api/v1/mdata/loads/:id/stops. A stop added there must carry what booking writes —
 * facility_name and postal_code (the 443.38 Samsara resolver keys on them) and coordinates when known — or the repaired
 * stop can never be placed. An added or moved stop re-resolves the load's stops and re-derives its legs in the same
 * transaction (CC-2 #26313 relearnLoadStopLegs), from both the add-stop route and the stop PATCH.
 * Run: node scripts/verify-settlement-creator-stop-add-carries-facility.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-stop-add-carries-facility";
const F = "apps/backend/src/mdata/loads.routes.ts";

export function problems(src) {
  const p = [];
  const a = src.indexOf("const createStopBodySchema = z.object({");
  if (a < 0) return ["createStopBodySchema not found"];
  const schema = src.slice(a, src.indexOf("});", a));
  for (const f of ["facility_name", "postal_code", "latitude", "longitude"]) if (!new RegExp(`\\b${f}: z\\.`).test(schema)) p.push(`the add-stop body drops ${f}`);
  const r = src.indexOf('app.post("/api/v1/mdata/loads/:id/stops"');
  if (r < 0) return [...p, "add-stop route not found"];
  const body = src.slice(r, src.indexOf("app.patch(", r));
  if (!/actual_arrival_source, actual_departure_source, status, notes,\s*facility_name, postal_code, latitude, longitude/.test(body)) p.push("the add-stop INSERT does not write facility_name / postal_code / latitude / longitude");
  if (!/b\.facility_name \?\? null,\s*b\.postal_code \?\? null,\s*b\.latitude \?\? null,\s*b\.longitude \?\? null,/.test(body)) p.push("the add-stop INSERT does not bind the caller's facility / zip / coordinates");
  // CC-2 #26313: an added or moved stop re-derives its legs in the same transaction — re-resolve first, then relearn.
  const h = src.indexOf("async function relearnStopsAfterEdit(");
  if (h < 0) p.push("relearnStopsAfterEdit not found");
  else {
    const helper = src.slice(h, src.indexOf("\n}\n", h));
    const g = helper.indexOf("geocodeStopsWithClient("), l = helper.indexOf("relearnLoadStopLegs(");
    if (g < 0 || l < 0 || g > l || !/reresolve: true/.test(helper)) p.push("relearnStopsAfterEdit must re-resolve the stops (reresolve) BEFORE relearnLoadStopLegs");
  }
  if (!/const stopLegs = await relearnStopsAfterEdit\(client as PoolClient, authUser\.uuid, scopedCompanyId, String\(row\.load_id\)\);/.test(body)) p.push("the add-stop route does not re-derive the load's legs");
  const pr = src.indexOf('app.patch("/api/v1/mdata/loads/:id/stops/:stopId"');
  const patch = pr < 0 ? "" : src.slice(pr, src.indexOf("app.delete(", pr));
  if (!/STOP_LEG_FIELDS\.some\(\(f\) => f in \(b as Record<string, unknown>\)\)\s*\? await relearnStopsAfterEdit\(/.test(patch)) p.push("the stop PATCH does not re-derive the legs when a stop moves");
  if (!/"sequence_number"/.test(src.slice(src.indexOf("const STOP_LEG_FIELDS"), src.indexOf("const STOP_LEG_FIELDS") + 300))) p.push("a sequence change no longer re-derives the legs");
  return p;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, F), "utf8");
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    (s) => s.replace("  facility_name: z.string().trim().max(240).optional(),\n", ""),
    (s) => s.replace("  postal_code: z.string().trim().max(20).optional(),\n  latitude:", "  latitude:"),
    (s) => s.replace("status, notes,\n              facility_name, postal_code, latitude, longitude", "status, notes"),
    (s) => s.replace("b.facility_name ?? null,", "null,"),
    (s) => s.replace("const stopLegs = await relearnStopsAfterEdit(client as PoolClient, authUser.uuid, scopedCompanyId, String(row.load_id));", "const stopLegs = null;"),
    (s) => s.replace("STOP_LEG_FIELDS.some((f) => f in (b as Record<string, unknown>))", "false"),
    (s) => s.replace("{ reresolve: true }", "{}"),
    (s) => s.replace('const STOP_LEG_FIELDS = ["sequence_number", ', "const STOP_LEG_FIELDS = ["),
  ];
  for (const f of plants) {
    const planted = f(good);
    if (planted === good) bad.push(`plant did not apply: ${f.toString().slice(0, 80)}`);
    else if (!problems(planted).length) bad.push(`plant passed: ${f.toString().slice(0, 80)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(fs.readFileSync(path.join(ROOT, F), "utf8"));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
