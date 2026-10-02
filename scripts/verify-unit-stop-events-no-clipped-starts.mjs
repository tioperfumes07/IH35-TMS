#!/usr/bin/env node
/**
 * ROUND 330.7 — a stop already in progress when the unit-stop writer's window opens is CLIPPED to the window's first
 * fix (a later start every tick), which defeated the (unit_id, started_at) key and stored one physical stop per tick
 * (prod 2026-10-02: 1,258 rows for 122 stops). FAILS IF the writer stops dropping the stop that begins at the window's
 * first fix. Live (DATABASE_URL set): FAILS IF any stop written after the fix cutoff has a copy — same unit, same
 * ended_at. Run: node scripts/verify-unit-stop-events-no-clipped-starts.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

// Not money (telematics stop rows). The static writer check below ALWAYS runs; only the live copy count needs a
// database and is skipped without one.
export const ALLOW_OFFLINE_SKIP = "telematics, not money: the static writer check always runs; only the live copy count needs DATABASE_URL";

const WRITER = "apps/backend/src/telematics/unit-stop-events.writer.ts";
const CUTOFF = "2026-10-03T06:00:00Z"; // after the fix deploys; earlier copies are the cleanup script's job

export function audit(src) {
  const f = [];
  if (!/const firstFixAt = fixes\[0\]\?\.capturedAt\.getTime\(\)/.test(src)) f.push("writer no longer reads the window's first fix");
  if (!/\.filter\(\(s\) => s\.startedAt\.getTime\(\) !== firstFixAt\)/.test(src)) f.push("writer no longer drops the stop clipped at the window start");
  return f;
}

const src = readFileSync(WRITER, "utf8");
if (process.argv.includes("--selftest")) {
  if (audit(src.replace("!== firstFixAt", "!== -1")).length === 0) { console.error("selftest FAIL: filter removal escaped"); process.exit(1); }
  if (audit(src.replace("const firstFixAt", "const firstFix")).length === 0) { console.error("selftest FAIL: first-fix removal escaped"); process.exit(1); }
  if (audit(src).length) { console.error("selftest FAIL: real writer flagged"); process.exit(1); }
  console.log("verify-unit-stop-events-no-clipped-starts selftest 3/3");
}
const fails = audit(src);
if (process.env.DATABASE_URL && !process.argv.includes("--selftest")) {
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const r = await c.query(
      `SELECT count(*)::int n FROM (SELECT unit_id, ended_at FROM telematics.unit_stop_events
         WHERE ended_at IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1 AND max(created_at) > $1::timestamptz) d`, [CUTOFF]);
    if (r.rows[0].n > 0) fails.push(`${r.rows[0].n} stop(s) written after ${CUTOFF} have a clipped copy`);
    await c.query("ROLLBACK");
  } finally { await c.end(); }
}
if (fails.length) { console.error(`verify-unit-stop-events-no-clipped-starts: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log("verify-unit-stop-events-no-clipped-starts: OK — clipped window-start stops are dropped");
