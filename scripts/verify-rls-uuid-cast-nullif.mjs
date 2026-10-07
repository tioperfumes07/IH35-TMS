#!/usr/bin/env node
/**
 * GUARD: no RLS policy may cast current_setting(...)::uuid bare. A pooled connection that ran a transaction-local
 * set_config holds '' afterwards, and ''::uuid raises 22P02 — the query dies instead of returning zero rows.
 *
 * TWO HALVES, because the files alone cannot prove the database (2026-10-05):
 *   STATIC — every migration numbered after the LATEST *_rls_uuid_cast_defensive sweep must wrap the cast in
 *            NULLIF(..., '') or guard it with a uuid-regex CASE.
 *   LIVE   — pg_policies must hold zero bare casts. 0359 was a one-shot sweep; 0355 was APPLIED an hour after it
 *            (prod applied_migrations: 0359 02:45, 0355 03:43, 0360 09:57 on 2026-06-04) and five policies stayed
 *            bare for four months while the file-only guard skipped everything numbered below 0359.
 *            Bare policies are tolerated only while the newest sweep is not yet applied (its deploy window).
 *            No DATABASE_URL = FAIL: an unread catalog is not a pass.
 *
 * Run:  node scripts/verify-rls-uuid-cast-nullif.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(ROOT, "db/migrations");
const BARE_CAST = /current_setting\([^)]+\)\s*::\s*uuid/i;
const NULLIF_WRAP = /NULLIF\s*\(\s*current_setting\([^)]+\)\s*,\s*''\s*\)\s*::\s*uuid/i;
// `CASE WHEN current_setting(...) ~* '^[0-9a-f]{8}-…$' THEN current_setting(...)::uuid END` never casts a non-uuid.
const REGEX_GUARDED = /current_setting\([^)]+\)\s*~\*?\s*'\^\[0-9a-f\]\{8\}/i;
const ALLOW_TAG = /ALLOW_BARE_UUID_CAST/;
const SWEEP = /rls_uuid_cast_defensive/;
// pg_get_expr() decompiles the cast as `(current_setting('…'::text, true))::uuid`; a NULLIF-wrapped one never matches.
export const LIVE_BARE = String.raw`\(current_setting\([^()]+\)\)::uuid`;

function migrationNumber(fileName) {
  const match = /^(\d+)_/.exec(fileName);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** Static half over { name, sql } migrations. Returns { failures, latestSweep }. */
export function staticProblems(migrations) {
  const failures = [];
  const sweeps = migrations.filter((m) => SWEEP.test(m.name));
  if (sweeps.length === 0) return { failures: ["missing *_rls_uuid_cast_defensive.sql migration"], latestSweep: null };
  const latest = sweeps.reduce((a, b) => (migrationNumber(b.name) > migrationNumber(a.name) ? b : a));
  const latestNum = migrationNumber(latest.name);
  for (const m of migrations) {
    if (SWEEP.test(m.name) || migrationNumber(m.name) < latestNum) continue;
    const lines = m.sql.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*--/.test(line) || !BARE_CAST.test(line)) continue;
      if (NULLIF_WRAP.test(line) || ALLOW_TAG.test(line)) continue;
      if (REGEX_GUARDED.test(line) || (i > 0 && REGEX_GUARDED.test(lines[i - 1]))) continue;
      failures.push(`${m.name}:${i + 1}: bare current_setting()::uuid without NULLIF wrap`);
    }
  }
  for (const s of sweeps) {
    if (!/ALTER POLICY|regexp_replace/.test(s.sql)) failures.push(`${s.name}: must ALTER POLICY expressions with NULLIF wrap`);
  }
  return { failures, latestSweep: latest.name };
}

/** Live half: bare policies + whether the newest sweep is applied. */
export function liveProblems({ bare, latestSweep, sweepApplied }) {
  if (bare.length === 0) return { failures: [], note: "0 bare policies" };
  const list = bare.map((b) => `${b.policy} ON ${b.tbl}`).join(", ");
  if (!sweepApplied) return { failures: [], note: `PENDING DEPLOY: ${bare.length} bare (${list}); ${latestSweep} not applied yet` };
  return {
    failures: [`live: ${bare.length} policy(ies) cast current_setting()::uuid bare after ${latestSweep} applied: ${list}`],
    note: "",
  };
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  const SW = { name: "0359_rls_uuid_cast_defensive.sql", sql: "ALTER POLICY" };
  const SW2 = { name: "0900_rls_uuid_cast_defensive_resweep.sql", sql: "ALTER POLICY" };
  const BARE = { name: "0950_x.sql", sql: "USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid)" };
  const WRAP = { name: "0950_x.sql", sql: "USING (operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)" };
  const CASED = { name: "0950_x.sql", sql: "v := CASE WHEN current_setting('app.current_user_id', true) ~* '^[0-9a-f]{8}-[0-9a-f]{4}$'\n  THEN current_setting('app.current_user_id', true)::uuid END;" };
  const OLD = { name: "0355_x.sql", sql: BARE.sql };
  t("bare cast after the sweep is caught", staticProblems([SW, BARE]).failures.length === 1);
  t("NULLIF-wrapped cast passes", staticProblems([SW, WRAP]).failures.length === 0);
  t("uuid-regex CASE-guarded cast passes", staticProblems([SW, CASED]).failures.length === 0);
  t("a file below the sweep is the live half's job", staticProblems([SW, OLD]).failures.length === 0);
  t("the LATEST sweep sets the floor", staticProblems([SW, SW2, { ...BARE, name: "0400_x.sql" }]).failures.length === 0);
  t("no sweep fails closed", staticProblems([BARE]).failures.length === 1);
  const b = [{ policy: "notify_log_company_scope", tbl: "dispatch.notify_log" }];
  t("live bare after the sweep applied fails", liveProblems({ bare: b, latestSweep: SW2.name, sweepApplied: true }).failures.length === 1);
  t("live bare before the sweep deploys is pending, not failed", liveProblems({ bare: b, latestSweep: SW2.name, sweepApplied: false }).failures.length === 0);
  t("live zero passes", liveProblems({ bare: [], latestSweep: SW2.name, sweepApplied: true }).failures.length === 0);
  const re = new RegExp(LIVE_BARE);
  t("live regex matches the decompiled bare shape", re.test("(operating_company_id = (current_setting('app.operating_company_id'::text, true))::uuid)"));
  t("live regex ignores the NULLIF shape", !re.test("(operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)"));
  return bad;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? "verify:rls-uuid-cast-nullif SELFTEST PASS — 11 cases" : `verify:rls-uuid-cast-nullif SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const migrations = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(migrationsDir, name), "utf8") }));
  const { failures, latestSweep } = staticProblems(migrations);

  let note = "";
  if (!process.env.DATABASE_URL) {
    failures.push("live: DATABASE_URL not set — pg_policies was not read, and an unread catalog is not a pass");
  } else if (latestSweep) {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const bare = (
        await client.query(
          `SELECT schemaname || '.' || tablename AS tbl, policyname AS policy FROM pg_policies
            WHERE coalesce(qual, '') ~ $1 OR coalesce(with_check, '') ~ $1 ORDER BY 1, 2`,
          [LIVE_BARE],
        )
      ).rows;
      const applied =
        (await client.query(`SELECT 1 FROM ih35_migrations.applied_migrations WHERE name = $1`, [latestSweep])).rowCount > 0;
      const live = liveProblems({ bare, latestSweep, sweepApplied: applied });
      failures.push(...live.failures);
      note = live.note;
    } finally {
      await client.end();
    }
  }

  if (failures.length > 0) {
    console.error("verify:rls-uuid-cast-nullif FAIL");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }
  console.log(`verify:rls-uuid-cast-nullif PASS (latest sweep ${latestSweep}; live: ${note})`);
}

await main();
