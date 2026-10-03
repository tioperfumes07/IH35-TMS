#!/usr/bin/env node
/**
 * verify-no-usmca-record-points-at-a-frozen-company — ROUND 373.5, CC-1.
 *
 * Owner ruling 2026-10-03: "we do not use another company's unit." A record references only its own company's driver,
 * and only a unit or trailer/equipment its company owns or currently leases (the lease is the one cross-entity path).
 * Refused in the database by migration 202615360400 (mdata.refuse_cross_company_reference on 34 document FK columns).
 *
 * The scope list is read from the migration itself — one source of truth.
 * LIVE (direct endpoint, unscoped, read-only):
 *   RULE 1 — USMCA document references (the migration's scope) to another company's driver, or to a unit/equipment USMCA
 *            neither owns nor leases: may only shrink from the measured 2 (loads 13481 / 13489, cancelled, unit T144
 *            leased to TRANSPORTATION — purge population).
 *   RULE 2 — once 202615360400 is applied, every in-scope column carries its trg_xco_* trigger and it is enabled.
 * --selftest exercises both rules and the scope parser.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "cross-company references on money documents — fails closed without a database";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-usmca-record-points-at-a-frozen-company";
const MIGRATION = "db/migrations/202615360400_no_record_points_at_another_companys_unit_driver_trailer.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CROSS_BASELINE = 2;

export function parseScope(sql) {
  return [...sql.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'(driver|unit|equipment)'\)/g)].map((m) => ({ sch: m[1], tbl: m[2], col: m[3], kind: m[4] }));
}

export function liveFailures({ cross, applied, missingTriggers }) {
  const out = [];
  if (cross > CROSS_BASELINE) out.push(`RULE 1 ${cross} USMCA document reference(s) to another company's driver/unit/equipment > baseline ${CROSS_BASELINE}`);
  if (applied && missingTriggers.length) out.push(`RULE 2 migration applied but ${missingTriggers.length} scoped column(s) lack an enabled trg_xco_* trigger: ${missingTriggers.join(", ")}`);
  return out;
}

async function measure(client, scope) {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  let cross = 0;
  const missing = [];
  for (const s of scope) {
    const reg = (await client.query(`SELECT to_regclass($1) AS r`, [`${s.sch}.${s.tbl}`])).rows[0].r;
    if (!reg) continue;
    const ok = s.kind === "driver"
      ? `p.operating_company_id::text = $1`
      : `(p.owner_company_id::text = $1 OR p.currently_leased_to_company_id::text = $1)`;
    const parent = s.kind === "driver" ? "mdata.drivers" : s.kind === "unit" ? "mdata.units" : "mdata.equipment";
    const r = await client.query(
      `SELECT count(*)::int AS n FROM "${s.sch}"."${s.tbl}" ch LEFT JOIN ${parent} p ON p.id = ch."${s.col}"
        WHERE ch.operating_company_id::text = $1 AND ch."${s.col}" IS NOT NULL AND NOT COALESCE(${ok}, false)`, [USMCA]);
    cross += r.rows[0].n;
    const t = (await client.query(
      `SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2 AND tgenabled <> 'D'`, [`${s.sch}.${s.tbl}`, `trg_xco_${s.col}`.slice(0, 63)])).rows.length;
    if (!t) missing.push(`${s.sch}.${s.tbl}.${s.col}`);
  }
  const applied = (await client.query(`SELECT 1 FROM _system._schema_migrations WHERE filename LIKE '202615360400%'`)).rows.length > 0;
  await client.query("ROLLBACK");
  return { cross, applied, missingTriggers: missing };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const scope = parseScope(readFileSync(join(ROOT, MIGRATION), "utf8"));
  if (process.argv.includes("--selftest")) {
    const cases = [
      ["the scope parser reads a declared VALUES row and its kind", (() => {
        const fx = parseScope("('mdata', 'loads', 'assigned_unit_id', 'unit'),\n    ('accounting', 'bills', 'driver_id', 'driver')");
        return fx.length === 2 && fx[0].col === "assigned_unit_id" && fx[1].kind === "driver";
      })()],
      ["the real migration declares a non-empty scope", scope.length > 0],
      ["baseline passes", liveFailures({ cross: 2, applied: true, missingTriggers: [] }).length === 0],
      ["a new cross reference fails", liveFailures({ cross: 3, applied: true, missingTriggers: [] }).some((x) => x.startsWith("RULE 1"))],
      ["applied with a missing trigger fails", liveFailures({ cross: 0, applied: true, missingTriggers: ["mdata.loads.assigned_unit_id"] }).some((x) => x.startsWith("RULE 2"))],
      ["not yet applied passes", liveFailures({ cross: 0, applied: false, missingTriggers: ["x"] }).length === 0],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const m = await measure(client, scope);
    const f = liveFailures(m);
    if (f.length) { console.error(`${LABEL}: FAIL\n  ${f.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — ${scope.length} document columns in scope; ${m.cross} USMCA cross-company reference(s) (baseline ${CROSS_BASELINE}, purge population, shrink-only); refusal ${m.applied ? "LIVE on every scoped column" : "not yet applied on this database"}.`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
