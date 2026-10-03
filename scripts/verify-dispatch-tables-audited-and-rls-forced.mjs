#!/usr/bin/env node
/**
 * Dispatch D3 (standing order: audit on every table, RLS entity-scoped on every table). FAILS IF any table of the
 * dispatch module — every dispatch.* table plus mdata.loads and mdata.load_stops — lacks an ENABLED audit.tg_audit_row()
 * trigger, or does not have row level security both ENABLED and FORCED. A new dispatch table that ships without them
 * fails the gate. Static: migration 202615330929 still declares the triggers + the FORCE.
 * No allow-list. No database = FAIL. Run: node scripts/verify-dispatch-tables-audited-and-rls-forced.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-dispatch-tables-audited-and-rls-forced";
const MIGRATION = "db/migrations/202615330929_dispatch_d3_row_audit_and_rls_force.sql";

export function auditStatic(sql) {
  const f = [];
  const n = (sql.match(/EXECUTE FUNCTION audit\.tg_audit_row\(\)/g) || []).length;
  if (n < 28) f.push(`${MIGRATION} declares ${n} audit triggers (expected 28)`);
  if (!/ALTER TABLE dispatch\.manual_delivery_authorizations FORCE ROW LEVEL SECURITY/.test(sql)) f.push("the RLS FORCE on manual_delivery_authorizations is gone");
  return f;
}
/** rows: { t, audited, rls, forced }[] */
export function auditLive(rows) {
  const f = [];
  for (const r of rows) {
    if (!r.audited) f.push(`${r.t}: no enabled audit.tg_audit_row trigger`);
    if (!r.rls || !r.forced) f.push(`${r.t}: row level security ${r.rls ? "not FORCED" : "not enabled"}`);
  }
  return f;
}

const sql = readFileSync(MIGRATION, "utf8");
if (process.argv.includes("--selftest")) {
  const ok = { t: "dispatch.x", audited: true, rls: true, forced: true };
  const cases = [
    ["static real", auditStatic(sql).length === 0],
    ["static force removed", auditStatic(sql.replace("FORCE ROW LEVEL SECURITY", "")).length === 1],
    ["live clean", auditLive([ok]).length === 0],
    ["live unaudited", auditLive([{ ...ok, audited: false }]).length === 1],
    ["live not forced", auditLive([{ ...ok, forced: false }]).length === 1],
    ["live no rls", auditLive([{ ...ok, rls: false, forced: false }]).length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`selftest FAIL: ${bad.map(([n]) => n).join(", ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const fails = auditStatic(sql);
const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL search_path = pg_catalog");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION.split("/").pop()])).rowCount > 0;
  const rows = (await c.query(`
    SELECT n.nspname || '.' || r.relname AS t, r.relrowsecurity AS rls, r.relforcerowsecurity AS forced,
           EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid JOIN pg_namespace pn ON pn.oid = p.pronamespace
                    WHERE tg.tgrelid = r.oid AND pn.nspname = 'audit' AND p.proname = 'tg_audit_row' AND tg.tgenabled <> 'D') AS audited
      FROM pg_class r JOIN pg_namespace n ON n.oid = r.relnamespace
     WHERE r.relkind = 'r' AND (n.nspname = 'dispatch' OR (n.nspname = 'mdata' AND r.relname IN ('loads', 'load_stops')))
     ORDER BY 1`)).rows;
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — migration not in the ledger; live check reported, not enforced`);
    console.log(`${LABEL}: ${auditLive(rows).length} gap(s) today across ${rows.length} tables`);
  } else {
    fails.push(...auditLive(rows));
    console.log(`${LABEL}: ${rows.length} dispatch-module tables checked live`);
  }
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS`);
