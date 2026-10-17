#!/usr/bin/env node
/**
 * Guard: verify-event-log-spine.mjs
 * Validates W1-EVENT-LOG-SPINE is properly installed.
 * - events.event_log table exists with the spine columns
 * - RLS enabled on it
 * - events.log_event() exists
 * - the append-only machinery is installed (hash chain + append-only trigger + UPDATE/DELETE revoked)
 * - the spine migrations contain no financial writes
 * - no direct INSERT INTO events.event_log in backend source outside log_event()
 *
 * LEAD 443.187 (CC-2 2026-10-17) — REPOINTED, same rules: the original (a5968903a0 / 44fbdae348, W1) used the Supabase
 * client (@supabase/supabase-js — no longer a dependency; the stack moved to Neon Postgres via `pg`) and read migrations
 * from apps/backend/migrations/0168_*, 0169_* (moved by c8aff7027f "re-home wave migrations to db/migrations/" to
 * db/migrations/202606111050_w1a_event_log_spine.sql and 202606111051_w1a_event_log_immutable.sql). Its revoke check looked
 * for the literal strings "revoke update" and "revoke delete", which the real single statement
 * "revoke update, delete on events.event_log from ih35_app;" never matched — now each privilege must appear in a REVOKE
 * on events.event_log (stricter: it must name the table). It also proved append-only by WRITING a test event and attempting
 * UPDATE/DELETE — a write to the production event log, which a read-only guard must never do. That runtime half is now
 * read from the catalog (the append-only trigger is installed on the table; UPDATE and DELETE are revoked from the app
 * role), and the source half stays with verify-event-log-worm.mjs (verify-step 16873).
 *
 * Read-only. Needs DATABASE_URL (CI's migrated test database, or prod via the read-only guard reader). No DB = FAIL.
 *   --selftest  plants each static regression and asserts the guard catches it (no DB needed).
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPINE_MIGRATION = "db/migrations/202606111050_w1a_event_log_spine.sql";
const IMMUTABLE_MIGRATION = "db/migrations/202606111051_w1a_event_log_immutable.sql";
const REQUIRED_COLS = ["event_id", "operating_company_id", "event_type", "actor_type", "actor_id", "subject_type", "subject_id", "occurred_at", "payload", "source", "created_at", "is_active"];
const REQUIRED_INDEX_PARTS = ["subject", "type", "actor", "ocid", "ocid_type_time"];

/** Static half — migrations + backend source. */
export function staticFindings({ spineSql, immutableSql, backend }) {
  const errors = [];
  const spine = spineSql.toLowerCase();
  for (const p of ["insert into accounting", "update accounting", "delete from accounting", "create table accounting", "alter table accounting"]) {
    if (spine.includes(p)) errors.push(`${SPINE_MIGRATION} contains financial write pattern: ${p}`);
  }
  const imm = immutableSql.toLowerCase();
  if (!imm.includes("prev_hash") || !imm.includes("hash")) errors.push(`${IMMUTABLE_MIGRATION} missing hash chain columns (prev_hash, hash)`);
  if (!imm.includes("calculate_event_hash")) errors.push(`${IMMUTABLE_MIGRATION} missing calculate_event_hash() function`);
  if (!imm.includes("event_log_append_only_trigger")) errors.push(`${IMMUTABLE_MIGRATION} missing append-only trigger function`);
  if (!imm.includes("append-only") || !imm.includes("raise exception")) errors.push(`${IMMUTABLE_MIGRATION} missing append-only enforcement (RAISE EXCEPTION)`);
  // `revoke update, delete on events.event_log from ih35_app;` (one statement) — each privilege must be in a REVOKE on the table.
  const revokes = imm.match(/revoke[^;]*\bon\s+events\.event_log\b[^;]*;/g) ?? [];
  if (!revokes.some((r) => /\bupdate\b/.test(r)) || !revokes.some((r) => /\bdelete\b/.test(r))) {
    errors.push(`${IMMUTABLE_MIGRATION} missing permission revocation for UPDATE/DELETE on events.event_log`);
  }
  const violations = backend
    .filter(([file, content]) => /INSERT\s+INTO\s+['"]?events['"]?\.['"]?event_log['"]?/i.test(content) && !content.includes("log_event("))
    .map(([file]) => file);
  if (violations.length) errors.push(`Direct INSERT INTO events.event_log found outside events service: ${violations.join(", ")}`);
  return errors;
}

function backendFiles(dir = join(ROOT, "apps/backend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") backendFiles(abs, out);
    } else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push([relative(ROOT, abs), readFileSync(abs, "utf8")]);
  }
  return out;
}

function loadStatic() {
  const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : "");
  return { spineSql: read(SPINE_MIGRATION), immutableSql: read(IMMUTABLE_MIGRATION), backend: backendFiles() };
}

/** Live half — read-only catalog queries. */
async function liveFindings(client) {
  const errors = [];
  const one = async (sql, params = []) => (await client.query(sql, params)).rows;
  if (!(await one(`SELECT 1 FROM information_schema.schemata WHERE schema_name = 'events'`)).length) errors.push("events schema does not exist");
  const cols = (await one(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'events' AND table_name = 'event_log'`)).map((r) => r.column_name);
  for (const c of REQUIRED_COLS) if (!cols.includes(c)) errors.push(`Missing required column: ${c}`);
  const rls = await one(`SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'events' AND c.relname = 'event_log'`);
  if (!rls[0]?.relrowsecurity) errors.push("RLS not enabled on events.event_log");
  if (!(await one(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'events' AND p.proname = 'log_event'`)).length) {
    errors.push("events.log_event() function does not exist");
  }
  const idx = (await one(`SELECT indexname FROM pg_indexes WHERE schemaname = 'events' AND tablename = 'event_log'`)).map((r) => r.indexname);
  for (const part of REQUIRED_INDEX_PARTS) if (!idx.some((i) => i.includes(part))) errors.push(`Missing required index pattern: idx_event_log_${part}`);
  const trig = await one(
    `SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE n.nspname = 'events' AND c.relname = 'event_log' AND NOT t.tgisinternal AND p.proname = 'event_log_append_only_trigger'`
  );
  if (!trig.length) errors.push("append-only trigger (event_log_append_only_trigger) is not installed on events.event_log");
  const app = await one(`SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app'`);
  if (app.length) {
    const priv = (await one(
      `SELECT has_table_privilege('ih35_app', 'events.event_log', 'UPDATE') AS upd, has_table_privilege('ih35_app', 'events.event_log', 'DELETE') AS del`
    ))[0];
    if (priv?.upd) errors.push("ih35_app can UPDATE events.event_log — append-only requires it revoked");
    if (priv?.del) errors.push("ih35_app can DELETE events.event_log — append-only requires it revoked");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const base = loadStatic();
  const clean = staticFindings(base);
  if (clean.length) {
    console.error("[verify-event-log-spine] SELFTEST FAIL: baseline not clean", clean);
    process.exit(1);
  }
  const plants = [
    ["financial write in spine migration", { ...base, spineSql: base.spineSql + "\ninsert into accounting.x values (1);" }],
    ["hash chain dropped", { ...base, immutableSql: base.immutableSql.replace(/calculate_event_hash/gi, "x") }],
    ["append-only trigger dropped", { ...base, immutableSql: base.immutableSql.replace(/event_log_append_only_trigger/gi, "x") }],
    ["revoke dropped", { ...base, immutableSql: base.immutableSql.replace(/revoke[^;]*on\s+events\.event_log[^;]*;/gi, "") }],
    ["delete no longer revoked", { ...base, immutableSql: base.immutableSql.replace(/revoke update, delete on events\.event_log/gi, "revoke update on events.event_log") }],
    ["direct event_log insert", { ...base, backend: [...base.backend, ["apps/backend/src/x.ts", "q(`INSERT INTO events.event_log (event_id) VALUES ($1)`)"]] }],
  ];
  for (const [name, f] of plants) {
    if (!staticFindings(f).length) {
      console.error(`[verify-event-log-spine] SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`[verify-event-log-spine] SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const errors = staticFindings(loadStatic());
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[verify-event-log-spine] FAIL: DATABASE_URL not set — the live half cannot run (a guard that cannot connect fails, never passes)");
  process.exit(1);
}
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  errors.push(...(await liveFindings(client)));
  await client.query("ROLLBACK");
} catch (e) {
  errors.push(`database read failed: ${e.message}`);
} finally {
  await client.end().catch(() => undefined);
}
if (errors.length) {
  console.error("[verify-event-log-spine] FAIL:");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}
console.log("[verify-event-log-spine] OK — events schema, event_log columns, RLS, log_event(), indexes, append-only trigger + UPDATE/DELETE revoked, no financial writes, no direct inserts");
