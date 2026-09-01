#!/usr/bin/env node
/**
 * Seed catalogs.lane_mileage from db/seeds/lane-mileage-usmca.csv (GO-16 Rev B).
 * Reference data only. USMCA company 5c854333-6ea5-4faa-af31-67cb272fef80.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CSV = join(ROOT, "db/seeds/lane-mileage-usmca.csv");

function num(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function zip(v) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}
function bool(v) {
  return ["true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(CSV, "utf8"));
  if (rows.length !== 3375) {
    console.error(`expected 3375 seed rows, got ${rows.length}`);
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  let n = 0;
  for (const r of rows) {
    await client.query(
      `INSERT INTO catalogs.lane_mileage (
         operating_company_id, origin_city, origin_state, origin_postal_code,
         dest_city, dest_state, dest_postal_code,
         practical_miles, short_miles, empty_miles,
         n_practical, n_short, practical_min, practical_max, practical_spread,
         short_min, short_max, confidence, autofill_allowed, source, first_seen, last_seen
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7,
         $8, $9, COALESCE($10, 0),
         $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21::date, $22::date
       )
       ON CONFLICT (operating_company_id, origin_city, origin_state, dest_city, dest_state)
         WHERE origin_postal_code IS NULL AND dest_postal_code IS NULL
       DO UPDATE SET
         practical_miles = EXCLUDED.practical_miles,
         short_miles = EXCLUDED.short_miles,
         empty_miles = EXCLUDED.empty_miles,
         n_practical = EXCLUDED.n_practical,
         n_short = EXCLUDED.n_short,
         practical_min = EXCLUDED.practical_min,
         practical_max = EXCLUDED.practical_max,
         practical_spread = EXCLUDED.practical_spread,
         short_min = EXCLUDED.short_min,
         short_max = EXCLUDED.short_max,
         confidence = EXCLUDED.confidence,
         autofill_allowed = EXCLUDED.autofill_allowed,
         source = EXCLUDED.source,
         first_seen = EXCLUDED.first_seen,
         last_seen = EXCLUDED.last_seen,
         updated_at = now()`,
      [
        USMCA,
        r["Origin City"],
        r["Origin State"],
        zip(r["Origin ZIP"]),
        r["Destination City"],
        r["Destination State"],
        zip(r["Destination ZIP"]),
        num(r.practical_miles),
        num(r.short_miles),
        num(r.empty_miles),
        Math.trunc(num(r.runs) ?? 0),
        Math.trunc(num(r.short_runs) ?? 0),
        num(r.practical_min),
        num(r.practical_max),
        num(r.practical_spread),
        num(r.short_min),
        num(r.short_max),
        r.confidence,
        bool(r.autofill_allowed),
        r.source,
        r.first_run || null,
        r.last_run || null,
      ]
    );
    n += 1;
  }
  await client.query("COMMIT");
  const c = await client.query(
    "SELECT count(*)::int AS n FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid",
    [USMCA]
  );
  console.log(`seeded ${n} rows; table count ${c.rows[0].n}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
