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
  const table = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((x) => x.length > 0)) table.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((x) => x.length > 0)) table.push(row);
  }
  const headers = (table[0] ?? []).map((h) => h.trim());
  return table.slice(1).map((cols) => {
    const out = {};
    headers.forEach((h, i) => {
      out[h] = cols[i] ?? "";
    });
    return out;
  });
}

if (process.argv.includes("--selftest")) {
  const rows = parseCsv('Origin City,practical_miles\n"Shippensburg, Pa",292.2\n');
  if (rows[0]["Origin City"] !== "Shippensburg, Pa" || rows[0].practical_miles !== "292.2") {
    console.error("seed-lane-mileage SELFTEST FAIL — quoted city / decimal column");
    process.exit(1);
  }
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!/ON CONFLICT \(operating_company_id, origin_postal_code, dest_postal_code\)/.test(src)) {
    console.error("seed-lane-mileage SELFTEST FAIL — zip-pair ON CONFLICT missing (re-seed unique violation)");
    process.exit(1);
  }
  if (!/ON CONFLICT \(operating_company_id, origin_city, origin_state, dest_city, dest_state\)/.test(src)) {
    console.error("seed-lane-mileage SELFTEST FAIL — city-pair ON CONFLICT missing");
    process.exit(1);
  }
  console.log("seed-lane-mileage SELFTEST PASS");
  process.exit(0);
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
  const setSql = `DO UPDATE SET
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
         updated_at = now()`;
  for (const r of rows) {
    const originZip = zip(r["Origin ZIP"]);
    const destZip = zip(r["Destination ZIP"]);
    const conflict = originZip && destZip
      ? `ON CONFLICT (operating_company_id, origin_postal_code, dest_postal_code)
         WHERE origin_postal_code IS NOT NULL AND dest_postal_code IS NOT NULL`
      : `ON CONFLICT (operating_company_id, origin_city, origin_state, dest_city, dest_state)
         WHERE origin_postal_code IS NULL AND dest_postal_code IS NULL`;
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
       ${conflict}
       ${setSql}`,
      [
        USMCA,
        r["Origin City"],
        r["Origin State"],
        originZip,
        r["Destination City"],
        r["Destination State"],
        destZip,
        num(r.practical_miles) ?? num(r.short_miles),
        num(r.short_miles),
        num(r.empty_miles) ?? 0,
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
