#!/usr/bin/env node
/**
 * ROUND 337 — a per-company rollup keyed without its company lets one entity overwrite another's row for a SHARED unit
 * or driver (reports.deadhead_cache was keyed (unit_id, week_starting); fixed by migration 202615300900). Generalized:
 *   static — FAILS IF any backend ON CONFLICT targeting a reports.* rollup names unit_id / driver_id / driver_uuid without
 *            operating_company_id;
 *   live (DATABASE_URL) — FAILS IF any unique index on a reports.* table that HAS operating_company_id covers a unit /
 *            driver / equipment column but not operating_company_id.
 * Run: node scripts/verify-rollup-keys-carry-company.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// Not money (operational rollups). The static check always runs; only the catalogue check needs a database.
export const ALLOW_OFFLINE_SKIP = "operational rollups, not money: the static ON CONFLICT check always runs; only the catalogue check needs DATABASE_URL";

const SUBJECT = /\b(unit_id|driver_id|driver_uuid|unit_uuid|equipment_id)\b/;
export function scanSource(files) {
  const hits = [];
  for (const [file, src] of files) {
    const re = /INSERT INTO\s+reports\.(\w+)[\s\S]*?ON CONFLICT\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src))) {
      const cols = m[2];
      if (SUBJECT.test(cols) && !/\boperating_company_id\b/.test(cols)) hits.push(`${file}: reports.${m[1]} ON CONFLICT (${cols.trim()}) has no operating_company_id`);
    }
  }
  return hits;
}
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) { const p = path.join(dir, n); if (statSync(p).isDirectory()) { if (n !== "node_modules" && n !== "__tests__") walk(p, out); } else if (/\.ts$/.test(n) && !/\.test\./.test(n)) out.push(p); }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = [["a.ts", "INSERT INTO reports.deadhead_cache (x) VALUES (1) ON CONFLICT (unit_id, week_starting) DO UPDATE SET x = 1"]];
  const good = [["b.ts", "INSERT INTO reports.deadhead_cache (x) VALUES (1) ON CONFLICT (operating_company_id, unit_id, week_starting) DO UPDATE SET x = 1"], ["c.ts", "INSERT INTO reports.lane_cache (x) ON CONFLICT (lane_key) DO NOTHING"]];
  if (scanSource(bad).length !== 1 || scanSource(good).length !== 0) { console.error("selftest FAIL"); process.exit(1); }
  console.log("verify-rollup-keys-carry-company selftest 3/3");
}
const fails = scanSource(walk("apps/backend/src").map((f) => [f, readFileSync(f, "utf8")]));
if (process.env.DATABASE_URL && !process.argv.includes("--selftest")) {
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = await c.query(`
      SELECT t.relname tbl, i.relname idx, array(SELECT a.attname::text FROM unnest(x.indkey) k JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k) cols
        FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE x.indisunique AND NOT x.indisprimary AND n.nspname = 'reports'
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'operating_company_id' AND NOT a.attisdropped)`);
    // an index a repo migration already drops is a fix awaiting deploy (migrations reach prod only via merge -> deploy)
    const migrations = readdirSync("db/migrations").filter((f) => f.endsWith(".sql")).map((f) => readFileSync(path.join("db/migrations", f), "utf8")).join("\n");
    for (const row of r.rows) {
      if (!row.cols.some((col) => SUBJECT.test(col)) || row.cols.includes("operating_company_id")) continue;
      if (new RegExp(`DROP INDEX IF EXISTS reports\\.${row.idx}\\b`).test(migrations)) { console.log(`verify-rollup-keys-carry-company: PENDING DEPLOY — reports.${row.idx} is dropped by a repo migration not yet applied`); continue; }
      fails.push(`reports.${row.tbl} unique index ${row.idx} (${row.cols.join(", ")}) has no operating_company_id`);
    }
    await c.query("ROLLBACK");
  } finally { await c.end(); }
}
if (fails.length) { console.error(`verify-rollup-keys-carry-company: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log("verify-rollup-keys-carry-company: OK — every reports.* rollup key over a unit/driver carries operating_company_id");
