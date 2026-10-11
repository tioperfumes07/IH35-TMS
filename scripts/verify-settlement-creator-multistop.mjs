#!/usr/bin/env node
/**
 * GUARD — CC-3 2026-10-11 (CC-2 finding on the 59): the Settlement Creator booked every load as pickup + delivery only, so
 * 10 multi-stop loads (P/D/D, P/D/D/D, P/D/P/D, P/P/P/D, P/P/D) lost their middle stops — wrong legs, miles and lane.
 * A draft load that lists its stops is booked with every one of them, in order; the route accepts the list.
 * Run: node scripts/verify-settlement-creator-multistop.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-multistop";
const SEED = "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts";
const ROUTE = "apps/backend/src/driver-finance/settlement-creator.routes.ts";
const TYPES = "apps/backend/src/driver-finance/settlement-creator.types.ts";

export function problems({ seed, route, types }) {
  const p = [];
  const a = seed.indexOf("function buildStops(");
  if (a < 0) return ["buildStops not found"];
  const head = seed.slice(a, a + 400);
  if (!/if \(load\.stops && load\.stops\.length >= 2\) return buildOrderedStops\(load, load\.stops\);/.test(head)) p.push("buildStops no longer books the draft's own stop list (collapses a multi-stop load to two)");
  const o = seed.indexOf("function buildOrderedStops(");
  if (o < 0) p.push("buildOrderedStops not found");
  else {
    const body = seed.slice(o, a);
    if (!/stops\.map\(\(st, i\) =>/.test(body) || !/sequence_number: i \+ 1/.test(body)) p.push("ordered stops are not booked one per listed stop, in order");
    if (!/stops_order_invalid/.test(body)) p.push("a stop list that does not start with a pickup and end with a delivery is no longer refused");
    if (!/stop_city_state_required/.test(body)) p.push("a listed stop without its real city/state is no longer refused (SETL-F438)");
  }
  if (!/stops: z\s*\.array\(/.test(route)) p.push("the route drops the draft's stop list (no stops schema)");
  if (!/stops\?: SettlementCreatorDraftStop\[\] \| null;/.test(types)) p.push("the draft load type has no stop list");
  return p;
}

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function selftest() {
  const good = { seed: read(SEED), route: read(ROUTE), types: read(TYPES) };
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    (g) => ({ ...g, seed: g.seed.replace("if (load.stops && load.stops.length >= 2) return buildOrderedStops(load, load.stops);", "") }),
    (g) => ({ ...g, seed: g.seed.replace("sequence_number: i + 1,", "sequence_number: 1,") }),
    (g) => ({ ...g, seed: g.seed.replace('"stops_order_invalid"', '"x"') }),
    (g) => ({ ...g, route: g.route.replace("stops: z\n          .array(", "stopz: z\n          .array(") }),
    (g) => ({ ...g, types: g.types.replace("stops?: SettlementCreatorDraftStop[] | null;", "") }),
  ];
  for (const f of plants) {
    const planted = f(good);
    if (JSON.stringify(planted) === JSON.stringify(good)) bad.push(`plant did not apply: ${f.toString().slice(0, 80)}`);
    else if (!problems(planted).length) bad.push(`plant passed: ${f.toString().slice(0, 80)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems({ seed: read(SEED), route: read(ROUTE), types: read(TYPES) });
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
