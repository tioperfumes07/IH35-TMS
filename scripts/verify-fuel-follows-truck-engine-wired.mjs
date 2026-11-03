#!/usr/bin/env node
/**
 * E9 / ENG-64 (LEAD 11-03) — every fill goes through the one fill engine; the engine never undoes a person's decision.
 * Root cause measured 11-03 (prod, USMCA): 598 of 856 live fuel rows had never been through resolveFillTruckAndLoad
 * (resolved_at NULL) — nothing but a hand-run route ever called it. The rerun compared the truck with card_unit_id, so 14
 * fills already on their GPS truck read "repoint" on every run, and it ignored recorded owner rulings (5 would have been
 * moved off the owner's load) and person-confirmed loads (OWNER RULING 443.288; 590 confirmed at settlement close). The
 * question path read telematics.vehicle_locations.odometer_meters, which never existed (the column is odometer_mi).
 * Static: the ingest hook runs the sweep under a lease; the sweep only takes unresolved, un-ruled fills, one transaction
 * each, failures reported; rerunAction checks ruling → owner ruling → confirmed load → held → current load + CURRENT unit;
 * evaluateFuelAssignment returns before applying for an owner ruling or a confirmed load; the facts read both; the odometer
 * read uses odometer_mi. --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-follows-truck-engine-wired";
const F = {
  hook: "apps/backend/src/fuel/fuel-ingest-hooks.ts",
  sweep: "apps/backend/src/fuel/fuel-follows-truck-sweep.ts",
  engine: "apps/backend/src/fuel/fill-truck-and-load.service.ts",
  question: "apps/backend/src/fuel/fuel-assignment-question.service.ts",
};

function fn(src, name) {
  const i = src.indexOf(`export function ${name}(`) >= 0 ? src.indexOf(`export function ${name}(`) : src.indexOf(`export async function ${name}(`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}

export function findDefects(s) {
  const out = [];
  if (!/runFuelFollowsTruckSweep\(/.test(s.hook)) out.push("the fuel ingest hook does not run the fill engine sweep");
  if (!/"fuel\.follows_truck"[\s\S]*?leaseSeconds: JOB_LEASE_SECONDS/.test(s.hook)) out.push("the sweep runs without a job lease (two instances could move one fill)");
  if (!/fuel_follows_truck_refused/.test(s.hook)) out.push("sweep failures are not raised (silent failure)");
  const list = fn(s.sweep, "listUnresolvedFills");
  if (!/f\.resolved_at IS NULL/.test(list)) out.push("the sweep is not limited to fills not yet through the engine");
  if (!/NOT LIKE 'owner_ruling:%'/.test(list)) out.push("the sweep lists owner-ruled fills");
  if (!/f\.voided_at IS NULL AND f\.archived_at IS NULL/.test(list)) out.push("the sweep lists voided / archived fills");
  if (!/e\.load_confirmation = 'confirmed'/.test(list)) out.push("the sweep lists person-confirmed fills (never moved, never stamped — they starve the queue)");
  if (/LIMIT \$2`,\s*\[companyId, limit\]/.test(list) || !/if \(page\.length < pageSize\) return out;/.test(list)) out.push("the sweep reads a capped list instead of keyset pages until exhausted");
  const sweep = fn(s.sweep, "runFuelFollowsTruckSweep");
  if (!/for \(const fuelId of ids\)[\s\S]*?withLuciaBypass\(/.test(sweep)) out.push("the sweep does not run each fill in its own transaction");
  if (!/applyIfCertain: true/.test(sweep)) out.push("the sweep does not apply certain fills");
  if (!/summary\.failures\.push/.test(sweep)) out.push("the sweep does not report failures");
  const act = fn(s.engine, "rerunAction");
  if (!act) out.push("rerunAction not exported");
  const order = ["input.hasRuling", "input.ownerRuled", "input.loadConfirmed", "!input.truckUnitId"].map((k) => act.indexOf(k));
  if (order.some((x) => x < 0) || order.some((x, k) => k > 0 && x < order[k - 1])) out.push("rerunAction does not check ruling → owner ruling → confirmed load → held in that order");
  if (!/input\.toUnitId !== input\.currentUnitId/.test(act) || /card/i.test(act.slice(act.indexOf("): RerunRow"))))
    out.push("rerunAction does not compare the engine truck with the row's CURRENT unit");
  const run = fn(s.engine, "runFuelFollowsTruck");
  if (!/rerunAction\(/.test(run) || !/currentUnitId: res\.unit_id/.test(run)) out.push("runFuelFollowsTruck does not decide through rerunAction with the current unit");
  const facts = fn(s.engine, "loadFillFacts");
  if (!/truck_resolution LIKE 'owner_ruling:%'/.test(facts)) out.push("the fill facts do not read a recorded owner ruling");
  if (!/load_confirmation = 'confirmed'/.test(facts)) out.push("the fill facts do not read a person-confirmed load (443.288)");
  if (!/relay_fuel_transaction_id = f\.relay_fuel_transaction_id/.test(facts)) out.push("a confirmed load on a Relay sibling row is not honored");
  const ev = fn(s.question, "evaluateFuelAssignment");
  const iRuled = ev.indexOf("if (res.owner_ruled) return");
  const iConf = ev.indexOf("if (res.load_confirmed) return");
  const iApply = ev.indexOf("applyFillTruckAndLoad(");
  if (iRuled < 0 || iConf < 0 || iApply < 0 || iRuled > iApply || iConf > iApply) out.push("evaluateFuelAssignment can apply over an owner ruling or a confirmed load");
  if (!/if \(!candidates\.length\) candidates = await parkedTrucksAtStation\(/.test(s.engine)) out.push("a truck parked at the pump (consecutive fixes bracketing the fill) is never considered (row 105)");
  if (/odometer_meters/.test(s.question)) out.push("the question path reads odometer_meters (the column is odometer_mi)");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => ({ ...src, [k]: src[k].replace(a, b) });
  const plants = [
    ["hook no longer sweeps", plant("hook", "await runFuelFollowsTruckSweep(id)", "await Promise.resolve(id)")],
    ["sweep takes resolved fills", plant("sweep", "AND f.resolved_at IS NULL", "")],
    ["sweep lists confirmed fills", plant("sweep", "AND e.load_confirmation = 'confirmed'", "AND e.load_confirmation = 'x'")],
    ["sweep stops after one page", plant("sweep", "if (page.length < pageSize) return out;", "return out;")],
    ["sweep takes owner-ruled fills", plant("sweep", "AND COALESCE(f.truck_resolution, '') NOT LIKE 'owner_ruling:%'", "")],
    ["rerun compares the card's unit", plant("engine", "input.toUnitId !== input.currentUnitId", "input.toUnitId !== input.cardUnitId")],
    ["rerun ignores owner rulings", plant("engine", '  if (input.ownerRuled) return "owner_ruled";\n', "")],
    ["rerun ignores confirmed loads", plant("engine", '  if (input.loadConfirmed) return "load_confirmed";\n', "")],
    ["facts drop the confirmed flag", plant("engine", "e.load_confirmation = 'confirmed'", "e.load_confirmation = 'proposed'")],
    ["evaluate applies over a confirmed load", plant("question", "  if (res.load_confirmed) return", "  if (false) return")],
    ["question reads odometer_meters", plant("question", "SELECT odometer_mi::text AS odo", "SELECT odometer_meters::text AS odo")],
    ["parked truck ignored", plant("engine", "if (!candidates.length) candidates = await parkedTrucksAtStation(", "if (false) candidates = await parkedTrucksAtStation(")],
    ["sweep failure swallowed", plant("hook", "if (failed.length) throw new Error(`fuel_follows_truck_refused:", "if (false) throw new Error(`x:")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(F).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — every unresolved fill goes through the one fill engine; owner rulings and confirmed loads are never moved`);
