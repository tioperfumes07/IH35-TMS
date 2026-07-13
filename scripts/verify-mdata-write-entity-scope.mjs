#!/usr/bin/env node
/**
 * mdata write-path entity-scope guard (USMCA cross-entity leak).
 *
 * mdata.units / mdata.equipment / mdata.load_stops carry NO usable entity RLS (units/equipment have
 * no operating_company_id and mdata RLS is role-scoped, not entity-scoped). So a write handler that
 * looks up / mutates a row by `WHERE id = $1` alone reaches ANY entity's truck/trailer/stop — a
 * cross-entity write that is masked while TRANSP is the only active entity and breaks the instant
 * USMCA launches. The read/list/status-change siblings already bind the owner/lessee (units/equipment)
 * or parent-load operating_company_id (load_stops) predicate; the PATCH / deactivate / quick-availability
 * and /stops write handlers must do the same.
 *
 * Locks:
 *   units.routes.ts     — PATCH + quick-availability + deactivate gate on (owner_company_id OR
 *                         currently_leased_to_company_id); no bare `FROM mdata.units WHERE id = $1 LIMIT 1`.
 *   equipment.routes.ts — PATCH + deactivate gate on (owner_company_id OR currently_leased_to_company_id);
 *                         no bare `FROM mdata.equipment WHERE id = $1 LIMIT 1`.
 *   loads.routes.ts     — POST/PATCH/DELETE /stops gate on the parent load's operating_company_id;
 *                         no bare `SELECT id FROM mdata.loads WHERE id = $1 LIMIT 1`.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-mdata-write-entity-scope";
const UNITS = "apps/backend/src/mdata/units.routes.ts";
const EQUIP = "apps/backend/src/mdata/equipment.routes.ts";
const LOADS = "apps/backend/src/mdata/loads.routes.ts";

// normalize: strip comments, collapse whitespace so placeholder spacing / line breaks don't matter
const norm = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ");

export function assertGuard({ units, equipment, loads }) {
  const errs = [];
  const u = norm(units);
  const e = norm(equipment);
  const l = norm(loads);

  // --- units ---
  if (u.includes("FROM mdata.units WHERE id = $1 LIMIT 1"))
    errs.push(`${UNITS}: bare unscoped read 'FROM mdata.units WHERE id = $1 LIMIT 1' — reaches any entity's truck. Add (owner_company_id OR currently_leased_to_company_id) scope.`);
  if (!u.includes("FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1"))
    errs.push(`${UNITS}: PATCH/quick-availability existence read is not entity-scoped to owner/lessee.`);
  if (!u.includes("AND (owner_company_id = $4 OR currently_leased_to_company_id = $4)"))
    errs.push(`${UNITS}: deactivate UPDATE is not gated on owner/lessee.`);

  // --- equipment ---
  if (e.includes("FROM mdata.equipment WHERE id = $1 LIMIT 1"))
    errs.push(`${EQUIP}: bare unscoped read 'FROM mdata.equipment WHERE id = $1 LIMIT 1' — reaches any entity's trailer. Add owner/lessee scope.`);
  if (!e.includes("AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1"))
    errs.push(`${EQUIP}: PATCH existence read is not entity-scoped to owner/lessee.`);
  if (!e.includes("AND (owner_company_id = $3 OR currently_leased_to_company_id = $3)"))
    errs.push(`${EQUIP}: deactivate UPDATE is not gated on owner/lessee.`);

  // --- loads /stops ---
  if (l.includes("SELECT id FROM mdata.loads WHERE id = $1 LIMIT 1"))
    errs.push(`${LOADS}: /stops parent-load lookup 'SELECT id FROM mdata.loads WHERE id = $1 LIMIT 1' is unscoped — reaches any entity's load. Add operating_company_id.`);
  if (!l.includes("SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1"))
    errs.push(`${LOADS}: POST /stops does not gate the parent load on operating_company_id.`);
  if (!l.includes("SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1"))
    errs.push(`${LOADS}: PATCH/DELETE /stops does not gate the parent load on operating_company_id.`);

  return errs;
}

function selftest() {
  const goodUnits = `
    const oldRes = await client.query(\`SELECT * FROM mdata.units WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1\`, [id, scoped]);
    UPDATE mdata.units SET deactivated_at = now() WHERE id = $1 AND deactivated_at IS NULL AND (owner_company_id = $4 OR currently_leased_to_company_id = $4)`;
  const goodEquip = `
    FROM mdata.equipment WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1
    UPDATE mdata.equipment SET deactivated_at = now() WHERE id = $1 AND deactivated_at IS NULL AND (owner_company_id = $3 OR currently_leased_to_company_id = $3)`;
  const goodLoads = `
    SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1
    SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1`;
  const cases = [
    { n: "all scoped → 0", in: { units: goodUnits, equipment: goodEquip, loads: goodLoads }, want: 0 },
    { n: "bare units read → flag", in: { units: `SELECT * FROM mdata.units WHERE id = $1 LIMIT 1`, equipment: goodEquip, loads: goodLoads }, min: 1 },
    { n: "bare equipment read → flag", in: { units: goodUnits, equipment: `SELECT id FROM mdata.equipment WHERE id = $1 LIMIT 1`, loads: goodLoads }, min: 1 },
    { n: "bare loads /stops lookup → flag", in: { units: goodUnits, equipment: goodEquip, loads: `SELECT id FROM mdata.loads WHERE id = $1 LIMIT 1` }, min: 1 },
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

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const errs = assertGuard({ units: read(UNITS), equipment: read(EQUIP), loads: read(LOADS) });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — mdata.units/equipment/load_stops write paths are entity-scoped.`);
