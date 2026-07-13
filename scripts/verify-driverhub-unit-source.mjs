#!/usr/bin/env node
/**
 * DRIVERHUB-3 guard — the Fleet Scheduler's "current tractor per driver" must come from the driver's
 * ACTIVE dispatch load (mdata.loads.assigned_unit_id where assigned_primary_driver_id = d.id), NOT the
 * unpopulated mdata.units.assigned_driver_id column (always NULL in prod → the Unit cell rendered blank).
 * Locks on driver-scheduler.service.ts:
 *   (1) does NOT join mdata.units on u.assigned_driver_id = d.id (the always-blank source).
 *   (2) resolves the unit via the driver's active load: assigned_primary_driver_id + assigned_unit_id.
 *   (3) uses the canonical DISPATCH_ACTIVE_LOAD_STATUSES set (not a hand-rolled status list).
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driverhub-unit-source";
const FILE = "apps/backend/src/safety/driver-scheduler.service.ts";

export function assertGuard({ src }) {
  const errs = [];
  const s = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, ""); // strip comments
  if (/mdata\.units\s+u[\s\S]{0,60}?u\.assigned_driver_id\s*=\s*d\.id/i.test(s))
    errs.push(`${FILE}: still joins mdata.units ON u.assigned_driver_id = d.id (always NULL in prod → blank Unit cell). Resolve the unit via the driver's active load instead.`);
  if (!/assigned_primary_driver_id\s*=\s*d\.id/i.test(s) || !/assigned_unit_id/i.test(s))
    errs.push(`${FILE}: does not resolve the current tractor via the driver's active load (mdata.loads.assigned_primary_driver_id → assigned_unit_id)`);
  if (!/DISPATCH_ACTIVE_LOAD_STATUSES/.test(src))
    errs.push(`${FILE}: does not use the canonical DISPATCH_ACTIVE_LOAD_STATUSES set for "active load"`);
  return errs;
}

function selftest() {
  const good = `import { DISPATCH_ACTIVE_LOAD_STATUSES } from "x";
    LEFT JOIN LATERAL (SELECT l.assigned_unit_id FROM mdata.loads l
      WHERE l.assigned_primary_driver_id = d.id AND l.status::text IN (a)) al ON TRUE
    LEFT JOIN mdata.units u ON u.id = al.assigned_unit_id`;
  const cases = [
    { n: "active-load source → 0", in: { src: good }, want: 0 },
    { n: "old assigned_driver_id join → flag", in: { src: `LEFT JOIN mdata.units u ON u.assigned_driver_id = d.id` }, min: 1 },
    { n: "no DISPATCH_ACTIVE_LOAD_STATUSES → flag", in: { src: good.replace("DISPATCH_ACTIVE_LOAD_STATUSES", "SOME_STATUSES") }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const p = path.join(ROOT, FILE);
if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${FILE}`); process.exit(1); }
const errs = assertGuard({ src: fs.readFileSync(p, "utf8") });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — scheduler resolves the current tractor via the driver's active load's assigned_unit_id.`);
