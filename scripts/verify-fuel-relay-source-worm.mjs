#!/usr/bin/env node
// CC-2 engine ten-point (WORM + audit + company scope) on the fuel / Relay source tables — migration 202615340600.
// Static: the migration keeps the voided-under-AUTH purge door (and the Relay-line cascade) and closes every other.
// Live (DATABASE_URL), once 202615340600 is applied: WORM on the 4 source tables, row audit on them + fraud_alerts,
// FORCE RLS on the 4 derived fuel tables. Before it is applied the live half reports pending, not pass.
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "reads pg_trigger / pg_class for the fuel + Relay source tables";

const LABEL = "verify-fuel-relay-source-worm";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG_NAME = "202615340600_fuel_relay_worm_audit_force_rls.sql";
const MIG = `db/migrations/${MIG_NAME}`;
export const WORM = ["fuel.fuel_transactions", "integrations.relay_fuel_transactions", "integrations.relay_fuel_transaction_lines", "integrations.relay_deposits"];
export const AUDITED = [...WORM, "fuel.fraud_alerts"];
export const FORCED = ["fuel.load_fuel_cost", "fuel.tank_events", "fuel.tank_state", "fuel.unit_mpg"];

export function check(sql) {
  const f = [];
  if (!/IF v_auth ~ '\^AUTH-\[0-9\]\+\$' THEN/.test(sql)) f.push(`${MIG}: a delete must need an open owner AUTH`);
  if (!/IF \(v_row ->> 'voided_at'\) IS NOT NULL THEN\s*RETURN OLD;/.test(sql)) f.push(`${MIG}: only a voided row may be purged`);
  if (!/RAISE EXCEPTION '% is WORM/.test(sql)) f.push(`${MIG}: the refusal is gone`);
  const wormList = sql.match(/worm text\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? "";
  for (const t of WORM) if (!wormList.includes(`'${t}'`)) f.push(`${MIG}: ${t} is no longer WORM`);
  if (!/refusing to FORCE it/.test(sql)) f.push(`${MIG}: FORCE must refuse a policy-less table`);
  return f;
}

export function judge({ applied, worm, audit, forced }) {
  if (!applied) return [];
  const f = [];
  for (const t of WORM) if (!worm.includes(t)) f.push(`${t}: no WORM delete refusal`);
  for (const t of AUDITED) if (!audit.includes(t)) f.push(`${t}: no row audit`);
  for (const t of FORCED) if (!forced.includes(t)) f.push(`${t}: RLS not forced`);
  return f;
}

const read = () => fs.readFileSync(path.join(ROOT, MIG), "utf8");

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["no AUTH needed", real.replace("IF v_auth ~ '^AUTH-[0-9]+$' THEN", "IF true THEN")],
    ["live rows purgeable", real.replace("IF (v_row ->> 'voided_at') IS NOT NULL THEN\n      RETURN OLD;", "IF true THEN\n      RETURN OLD;")],
    ["fuel table dropped from WORM", real.replace("worm text[] := ARRAY['fuel.fuel_transactions', ", "worm text[] := ARRAY[")],
  ];
  for (const [name, s] of plants) {
    if (s === real) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  const all = { applied: true, worm: [...WORM], audit: [...AUDITED], forced: [...FORCED] };
  if (judge(all).length) fails.push("complete state flagged");
  if (judge({ ...all, worm: WORM.slice(1) }).length !== 1) fails.push("missing WORM not caught");
  if (judge({ ...all, forced: FORCED.slice(1) }).length !== 1) fails.push("unforced RLS not caught");
  if (judge({ applied: false, worm: [], audit: [], forced: [] }).length) fails.push("pending apply flagged");
  const n = plants.length + 4;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const applied = (await c.query(`SELECT EXISTS (SELECT 1 FROM ih35_migrations.applied_migrations WHERE name = $1) AS ok`, [MIG_NAME])).rows[0].ok;
  const worm = (await c.query(`SELECT tgrelid::regclass::text t FROM pg_trigger WHERE tgname = 'trg_worm_refuse_delete' AND tgenabled <> 'D' AND tgrelid::regclass::text = ANY($1)`, [WORM])).rows.map((r) => r.t);
  const audit = (await c.query(`SELECT DISTINCT tgrelid::regclass::text t FROM pg_trigger WHERE tgfoid = 'audit.tg_audit_row'::regproc AND tgrelid::regclass::text = ANY($1)`, [AUDITED])).rows.map((r) => r.t);
  const forced = (await c.query(`SELECT oid::regclass::text t FROM pg_class WHERE relforcerowsecurity AND oid::regclass::text = ANY($1)`, [FORCED])).rows.map((r) => r.t);
  await c.query("ROLLBACK");
  const bad = judge({ applied, worm, audit, forced });
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(applied
    ? `${LABEL}: PASS — WORM ${worm.length}/4, audit ${audit.length}/5, FORCE RLS ${forced.length}/4`
    : `${LABEL}: PASS (static) — ${MIG_NAME} not yet applied on this database; live half pending`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
