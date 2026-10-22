#!/usr/bin/env node
/**
 * LEAD 443.244 (owner 2026-10-22 2:10 PM CT: "yes it should. remember we might book a load in advance etc.") — a truck holds ONE
 * load IN MOTION (dispatched / at_pickup / in_transit / at_delivery) plus any number of advance bookings (assigned /
 * assigned_not_dispatched). The app gate and both DB unit backstops refused any second assigned_not_dispatched load, so 13693
 * could not be T177's next load behind 13690.
 * STATIC: RULE 1 the app gate's ACTIVE_UNIT_STATUSES is exactly the in-motion set; RULE 2 the migration's backstops use only the
 * in-motion set (no advance status in either trigger).
 * LIVE (USMCA, read-only): RULE 3 no truck holds two loads in motion that are not same-tour sequential legs.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-truck-one-in-motion-plus-advance";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const F = {
  gate: "apps/backend/src/dispatch/unit-active-load-guard.ts",
  mig: "db/migrations/202616150100_truck_one_in_motion_plus_advance_bookings.sql",
};
const IN_MOTION = ["dispatched", "at_pickup", "in_transit", "at_delivery"];
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function staticFailures(s) {
  const out = [];
  const block = s.gate.match(/export const ACTIVE_UNIT_STATUSES\s*=\s*\[([^\]]*)\]/);
  const set = block ? [...block[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : [];
  if (set.sort().join(",") !== [...IN_MOTION].sort().join(","))
    out.push(`RULE 1 ${F.gate}: ACTIVE_UNIT_STATUSES must be exactly the in-motion set (${IN_MOTION.join(", ")}) — got ${set.join(", ") || "nothing"}`);
  for (const fn of ["refuse_second_active_load_on_unit", "refuse_overlapping_unit_assignment"]) {
    const body = (s.mig.match(new RegExp(`FUNCTION mdata\\.${fn}\\(\\)[\\s\\S]*?\\$function\\$;`)) || [])[0] ?? "";
    if (!body) { out.push(`RULE 2 ${F.mig}: mdata.${fn} is not redefined`); continue; }
    if (/'assigned'|'assigned_not_dispatched'/.test(body)) out.push(`RULE 2 ${F.mig}: mdata.${fn} still treats an advance booking as occupying the truck`);
    for (const st of IN_MOTION) if (!body.includes(`'${st}'`)) out.push(`RULE 2 ${F.mig}: mdata.${fn} no longer refuses a second load in '${st}'`);
  }
  return out;
}

export const LIVE_SQL = `
SELECT u.unit_number, a.load_number AS a, b.load_number AS b
  FROM mdata.loads a
  JOIN mdata.loads b ON b.assigned_unit_id = a.assigned_unit_id AND b.id > a.id AND b.operating_company_id = a.operating_company_id
  JOIN mdata.units u ON u.id = a.assigned_unit_id
 WHERE a.operating_company_id = $1::uuid AND a.soft_deleted_at IS NULL AND b.soft_deleted_at IS NULL
   AND a.voided_at IS NULL AND b.voided_at IS NULL
   AND a.status::text = ANY($2::text[]) AND b.status::text = ANY($2::text[])
   AND NOT mdata.unit_legs_are_same_tour_sequential(a.id, b.id)
 ORDER BY 1`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (process.argv.includes("--selftest")) {
    const cases = [
      ["source is clean", staticFailures(base).length === 0],
      ["RULE 1 advance status back in the app gate", staticFailures({ ...base, gate: base.gate.replace('"dispatched",', '"assigned_not_dispatched",\n  "dispatched",') }).some((x) => x.startsWith("RULE 1"))],
      ["RULE 2 advance status back in a trigger", staticFailures({ ...base, mig: base.mig.replace("'dispatched','at_pickup','in_transit','at_delivery'", "'assigned_not_dispatched','dispatched','at_pickup','in_transit','at_delivery'") }).some((x) => x.startsWith("RULE 2"))],
      ["RULE 2 in-motion status dropped", staticFailures({ ...base, mig: base.mig.replaceAll("'dispatched','at_pickup','in_transit','at_delivery'", "'at_pickup','in_transit','at_delivery'") }).some((x) => x.startsWith("RULE 2"))],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = staticFailures(base);
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    for (const r of (await client.query(LIVE_SQL, [USMCA, IN_MOTION])).rows)
      failures.push(`RULE 3 truck ${r.unit_number} has two loads in motion: ${r.a} and ${r.b}`);
  } finally {
    client.release();
    await pool.end();
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL (${failures.length})\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — one load in motion per truck plus advance bookings; app gate and DB backstops agree.`);
}
