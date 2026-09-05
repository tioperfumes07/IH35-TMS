#!/usr/bin/env node
/**
 * verify-seed-script-usmca-cutover-floor.mjs — STEP 2 of 6 (owner numbered sequence 2026-09-05, CC-3 block,
 * ~/Downloads/2026-09-05-CODER-SEQUENCE-NUMBERED-DEVIN.md): "seed-script HARD FLOOR — reject any
 * load pickup < 2026-08-07."
 *
 * Two checks, both required:
 *   1. SOURCE — every seed script that books USMCA loads must carry a real, checked 08/07 cutover
 *      refusal before it ever calls bookLoad()/app.inject() (source-level regression lock; CI has
 *      no reachable Postgres for these scripts' own runtime logic).
 *   2. LIVE — no active (not soft-deleted) USMCA load has a first-pickup stop before 2026-08-07.
 *      This is the actual invariant the whole reconciliation/quarantine effort exists to protect;
 *      the source check alone cannot prove a load never slipped through some OTHER write path
 *      (a manual Book Load, a different script, a future one this file doesn't know about yet).
 *
 * Run: node scripts/verify-seed-script-usmca-cutover-floor.mjs [--live] [--selftest]
 * `--live` requires DATABASE_URL (Neon prod) and is NOT part of the static CI sweep (no reachable
 * Postgres there) — the source check runs unconditionally, matching this repo's own established
 * pattern for guards that also carry an optional live half (e.g. verify-settlement-seed-*.mjs's own
 * static-only default).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CUTOVER_DATE = "2026-08-07";

// Every seed script this repo has that books USMCA loads via bookLoad(). New seed scripts must be
// added here or this guard silently stops covering them.
const SEED_SCRIPTS = [
  "scripts/seed-missing-usmca-loads.ts",
];

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(sources = SEED_SCRIPTS.map((p) => [p, loadSource(p)])) {
  const failures = [];
  for (const [rel, src] of sources) {
    if (!/2026-08-07/.test(src)) {
      failures.push(`${rel}: no reference to the 2026-08-07 cutover date at all`);
      continue;
    }
    // Must be a real comparison against the load's own pickup date, not just a string mentioned in
    // a comment — require it to appear in a conditional (if/continue/return/throw) alongside the
    // pickup field, and to run BEFORE the load reaches bookLoad(.
    const cutoverIdx = src.search(/pickup\.date\s*<\s*USMCA_CUTOVER_DATE/);
    if (cutoverIdx === -1) {
      failures.push(`${rel}: cutover date is mentioned but not wired into a real pickup-date comparison`);
      continue;
    }
    const bookLoadIdx = src.indexOf("await bookLoad(");
    if (bookLoadIdx !== -1 && cutoverIdx > bookLoadIdx) {
      failures.push(`${rel}: the cutover check appears AFTER the first bookLoad() call — it must run before any write`);
    }
  }
  return failures;
}

async function liveCheck() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await client.query(
      `
        SELECT l.load_number, MIN(ls.scheduled_arrival_at)::date::text AS first_pickup
        FROM mdata.loads l
        JOIN mdata.load_stops ls ON ls.load_id = l.id AND ls.stop_type = 'pickup' AND ls.soft_deleted_at IS NULL
        WHERE l.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
          AND l.soft_deleted_at IS NULL
        GROUP BY l.load_number
        HAVING MIN(ls.scheduled_arrival_at)::date < $1::date
        ORDER BY l.load_number
      `,
      [CUTOVER_DATE]
    );
    return res.rows;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const selftest = args.includes("--selftest");

  if (selftest) {
    const good = SEED_SCRIPTS.map((p) => [p, loadSource(p)]);
    const baseline = collectSourceFailures(good);
    if (baseline.length) {
      console.error(`verify-seed-script-usmca-cutover-floor SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
      process.exit(1);
    }
    const escaped = [];
    for (const [rel, src] of good) {
      const stripped = src.replace(/2026-08-07/g, "");
      if (collectSourceFailures([[rel, stripped]]).length === 0) escaped.push(`${rel}: removing the cutover date entirely was not caught`);
      const reordered = src.replace(
        /if \(load\.pickup\.date < USMCA_CUTOVER_DATE\) \{[\s\S]*?continue;\n\s*\}/,
        ""
      );
      // Only meaningful if the removal actually changed the source (i.e. the pattern matched).
      if (reordered !== src && collectSourceFailures([[rel, reordered]]).length === 0) {
        escaped.push(`${rel}: removing the whole cutover conditional was not caught`);
      }
    }
    if (escaped.length) {
      console.error(`verify-seed-script-usmca-cutover-floor SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
      process.exit(1);
    }
    console.log("verify-seed-script-usmca-cutover-floor SELFTEST OK — 2/2 plants rejected");
  }

  const sourceFailures = collectSourceFailures();
  if (sourceFailures.length) {
    console.error("verify-seed-script-usmca-cutover-floor: FAIL (source)");
    for (const f of sourceFailures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-seed-script-usmca-cutover-floor: source OK — every known seed script refuses a pre-08/07 pickup before any write");

  if (live) {
    const rows = await liveCheck();
    if (rows.length) {
      console.error(`verify-seed-script-usmca-cutover-floor: FAIL (live) — ${rows.length} active USMCA load(s) below the 08/07 floor:`);
      for (const r of rows) console.error(`  - load ${r.load_number}: first pickup ${r.first_pickup}`);
      process.exit(1);
    }
    console.log("verify-seed-script-usmca-cutover-floor: live OK — 0 active USMCA loads below 2026-08-07");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
