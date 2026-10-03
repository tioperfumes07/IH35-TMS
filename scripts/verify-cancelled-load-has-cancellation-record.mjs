#!/usr/bin/env node
/**
 * ROUND 353 — load 13515 was set 'cancelled' by a bare UPDATE (AUTH-201's ops script), bypassing the cancellation engine:
 * no dispatch.load_cancellations row, no reason, no void stamp. FAILS IF:
 *   static — migration 202615330905's deferred constraint trigger (a load may only MOVE to cancelled with an approved
 *            cancellation record) is no longer declared;
 *   live   — the trigger is missing or disabled on mdata.loads, or any cancelled load lacks an approved
 *            dispatch.load_cancellations row, other than the named KNOWN rows (shrink-only).
 * Counts under SET LOCAL app.bypass_rls = 'lucia' (named per the count law). No database = FAIL.
 * Run: node scripts/verify-cancelled-load-has-cancellation-record.mjs [--selftest]
 */
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-cancelled-load-has-cancellation-record";
const MIGRATION = "db/migrations/202615330905_load_cancelled_requires_cancellation_record.sql";
const TRIGGER = "trg_load_cancelled_requires_cancellation_record";
// Shrink-only. Remove an entry the moment its row is gone.
export const KNOWN = {
  "E2E-2E-95603e75": "E2E test residue in USMCA (is_sample_data=false), no ledger — purge population; test data is deleted, never given a cancellation record",
};

export function auditStatic(sql) {
  const f = [];
  if (!new RegExp(`CREATE CONSTRAINT TRIGGER ${TRIGGER}`).test(sql)) f.push(`${MIGRATION} no longer creates ${TRIGGER}`);
  if (!/DEFERRABLE INITIALLY DEFERRED/.test(sql)) f.push("the trigger is no longer deferred (the engine's write order would break)");
  if (!/lc\.status = 'approved'/.test(sql)) f.push("the trigger no longer requires an APPROVED cancellation record");
  return f;
}
export function auditLive(trigger, missing) {
  const f = [];
  if (!trigger) f.push(`${TRIGGER} is not on mdata.loads`);
  else if (trigger.tgenabled === "D") f.push(`${TRIGGER} is DISABLED`);
  for (const r of missing) if (!KNOWN[r.load_number]) f.push(`${r.code} load ${r.load_number} is cancelled with no approved cancellation record`);
  return f;
}

const sql = readFileSync(MIGRATION, "utf8");
if (process.argv.includes("--selftest")) {
  const ok = { tgenabled: "O" };
  const cases = [
    ["static real", auditStatic(sql).length === 0],
    ["static trigger removed", auditStatic(sql.replace(`CREATE CONSTRAINT TRIGGER ${TRIGGER}`, "x")).length === 1],
    ["static not deferred", auditStatic(sql.replace("DEFERRABLE INITIALLY DEFERRED", "")).length === 1],
    ["live clean", auditLive(ok, []).length === 0],
    ["live known only", auditLive(ok, [{ code: "USMCA", load_number: "E2E-2E-95603e75" }]).length === 0],
    ["live new violation", auditLive(ok, [{ code: "USMCA", load_number: "13999" }]).length === 1],
    ["live trigger missing", auditLive(null, []).length === 1],
    ["live trigger disabled", auditLive({ tgenabled: "D" }, []).length === 1],
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
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = $1`, [MIGRATION.split("/").pop()])).rowCount > 0;
  const trigger = (await c.query(`SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'mdata.loads'::regclass AND tgname = $1`, [TRIGGER])).rows[0] ?? null;
  const missing = (await c.query(`
    SELECT co.code, l.load_number FROM mdata.loads l JOIN org.companies co ON co.id = l.operating_company_id
     WHERE l.status::text = 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM dispatch.load_cancellations lc WHERE lc.load_id = l.id AND lc.status = 'approved')
     ORDER BY 1, 2`)).rows;
  if (!applied) {
    console.log(`${LABEL}: PENDING DEPLOY — migration not in the ledger; trigger check skipped`);
    fails.push(...auditLive({ tgenabled: "O" }, missing));
  } else {
    fails.push(...auditLive(trigger, missing));
  }
  console.log(`${LABEL}: ${missing.length} cancelled load(s) without an approved record (${missing.filter((r) => KNOWN[r.load_number]).length} known)`);
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
if (fails.length) { for (const x of fails) console.error(`FAIL ${x}`); process.exit(1); }
console.log(`${LABEL}: PASS`);
