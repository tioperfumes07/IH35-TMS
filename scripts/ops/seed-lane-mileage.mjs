#!/usr/bin/env node
/**
 * Seed catalogs.lane_mileage from db/seeds/lane-mileage-usmca.csv (GO-16 Rev B).
 * Reference data only. USMCA company 5c854333-6ea5-4faa-af31-67cb272fef80.
 *
 * REBUILD (2026-09-03): replaced the prior 3338-row ZIP-bearing source with a fresh 3093-row
 * AlwaysTrack PC*MILER extract (~/Downloads/lane-mileage-reimport-source.csv). Different, simpler
 * header shape -- no ZIP columns, no short_miles/short_runs, a spread PERCENTAGE instead of
 * absolute min/max. This is a FULL REPLACE for the USMCA company (TRUNCATE-then-insert in one
 * transaction, not an upsert-only pass): confirmed no FK anywhere references lane_mileage.id, and
 * every reader (lane-mileage.service.ts) looks the row up by operating_company_id + city/state,
 * never by a stored id, so a wholesale replace is safe.
 *
 * FIELD MAPPING (documented judgment call -- this table's CHECK(confidence) only has 4 buckets,
 * the new source has 4 DIFFERENT ones):
 *   empty_miles_avg -> empty_miles ; n_loads -> n_practical ; source (always the one AlwaysTrack
 *   string) -> 'History' (it IS historical trip data, matching the existing bucket's meaning).
 *   confidence: High -> High (exact) ; Medium -> 'Check ZIP' ; Low/Single -> 'Thin'. No column in
 *   this source maps to 'Manual'. autofill_allowed is the FUNCTIONALLY important field and passes
 *   through directly from the source, unaffected by this label mapping.
 *   practical_spread computed as practical_miles * miles_spread_pct / 100 (absolute miles, to
 *   match this column's existing unit) when spread_pct is present; practical_min/practical_max
 *   are NOT derivable from a percentage alone and are left NULL rather than fabricated.
 *   short_miles / short_min / short_max / n_short: this source has no shortest-route variant at
 *   all -- NULL / 0, not carried over from any prior seed's values.
 *
 * DATA-QUALITY SKIP: exactly 1 of 3093 source rows carries a 5-digit ZIP ("78045") in the
 * origin_city column instead of a city name (a source-file glitch, not a real city called
 * "78045") -- skipped rather than inserted as a fake city name or silently guessed at.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CSV = join(ROOT, "db/seeds/lane-mileage-usmca.csv");
const ZIP_RE = /^\d{5}$/;

function num(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function bool(v) {
  return ["true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());
}
function mapConfidence(raw) {
  const v = String(raw ?? "").trim();
  if (v === "High") return "High";
  if (v === "Medium") return "Check ZIP";
  if (v === "Low" || v === "Single") return "Thin";
  return "Thin";
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

export function buildInsertRows(rawRows) {
  const skipped = [];
  const rows = [];
  for (const r of rawRows) {
    const originCity = r.origin_city.trim();
    const destCity = r.dest_city.trim();
    if (ZIP_RE.test(originCity) || ZIP_RE.test(destCity)) {
      skipped.push(r);
      continue;
    }
    const practicalMiles = num(r.practical_miles);
    const spreadPct = num(r.miles_spread_pct);
    rows.push({
      origin_city: originCity,
      origin_state: r.origin_state.trim(),
      dest_city: destCity,
      dest_state: r.dest_state.trim(),
      practical_miles: practicalMiles,
      empty_miles: num(r.empty_miles_avg) ?? 0,
      n_practical: Math.trunc(num(r.n_loads) ?? 0),
      practical_spread:
        practicalMiles != null && spreadPct != null
          ? Math.round(((practicalMiles * spreadPct) / 100) * 10) / 10
          : null,
      confidence: mapConfidence(r.confidence),
      autofill_allowed: bool(r.autofill_allowed),
      source: "History",
      first_seen: r.first_seen || null,
      last_seen: r.last_seen || null,
    });
  }
  return { rows, skipped };
}

if (process.argv.includes("--selftest")) {
  const rows = parseCsv(
    'origin_city,origin_state,dest_city,dest_state,practical_miles,empty_miles_avg,n_loads,miles_spread_pct,first_seen,last_seen,source,confidence,autofill_allowed\n' +
      '"Shippensburg, Pa",PA,Laredo,TX,292.2,10.0,3,5.0,2026-01-01,2026-02-01,AlwaysTrack PC*MILER (L.Miles),High,true\n' +
      "78045,TX,Jersey City,NJ,1970.9,0.0,1,0.0,2026-07-23,2026-07-23,AlwaysTrack PC*MILER (L.Miles),Single,false\n"
  );
  if (rows.length !== 2 || rows[0].origin_city !== "Shippensburg, Pa") {
    console.error("seed-lane-mileage SELFTEST FAIL — quoted city / header parse");
    process.exit(1);
  }
  const { rows: built, skipped } = buildInsertRows(rows);
  if (built.length !== 1 || skipped.length !== 1) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected 1 built + 1 skipped, got ${built.length}/${skipped.length}`);
    process.exit(1);
  }
  if (built[0].confidence !== "High" || built[0].source !== "History") {
    console.error("seed-lane-mileage SELFTEST FAIL — confidence/source mapping wrong");
    process.exit(1);
  }
  if (built[0].practical_spread !== 14.6) {
    console.error(`seed-lane-mileage SELFTEST FAIL — practical_spread computed wrong: ${built[0].practical_spread}`);
    process.exit(1);
  }
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!/TRUNCATE/.test(src)) {
    console.error("seed-lane-mileage SELFTEST FAIL — full-replace TRUNCATE missing (rebuild must not silently upsert-only)");
    process.exit(1);
  }
  // Live-hit regression guard: the pooled-connection role-downgrade landmine (neondb_owner silently
  // becomes ih35_app) means RESET ROLE + the bypass + the count read-back must all share ONE
  // explicit transaction, or the verification read silently returns 0 with no error even when the
  // write succeeded -- reproduced live twice before this shape was right. Count RESET ROLE
  // occurrences (must be 2: once before the write transaction, once before the verify transaction).
  const resetRoleCount = (src.match(/RESET ROLE/g) || []).length;
  if (resetRoleCount < 2) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected RESET ROLE before both the write and the verify transaction, found ${resetRoleCount}`);
    process.exit(1);
  }
  if (!/BEGIN"\);\s*\n\s*await client\.query\("RESET ROLE"\);\s*\n\s*await client\.query\("SELECT set_config/.test(src)) {
    console.error("seed-lane-mileage SELFTEST FAIL — verify block must be BEGIN; RESET ROLE; set_config bypass; SELECT count; COMMIT as ONE transaction");
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
  const raw = parseCsv(readFileSync(CSV, "utf8"));
  if (raw.length !== 3093) {
    console.error(`expected 3093 source rows, got ${raw.length}`);
    process.exit(1);
  }
  const { rows, skipped } = buildInsertRows(raw);
  if (skipped.length !== 1) {
    console.error(`expected exactly 1 data-quality skip (ZIP-as-city), got ${skipped.length}`);
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  // Neon's pooled connection silently downgrades session_user=neondb_owner to
  // current_user=ih35_app -- RESET ROLE first, every write, or FORCE RLS + the LOCAL-scoped
  // bypass below silently filters writes to 0 affected rows with NO error (see
  // neon-pooled-owner-connection-role-downgrade memory / 00_LOCKED_DECISIONS DML landmine).
  await client.query("RESET ROLE");
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  // Full replace, not upsert-only: this source's 3092 lanes do not carry forward the prior
  // 3338-row ZIP-bearing dataset's rows that never appear here. TRUNCATE is scoped to a single
  // company's rows via DELETE (TRUNCATE itself cannot be WHERE-scoped), same transaction as the
  // reinsert -- a mid-transaction failure rolls back to the untouched prior state, never leaves
  // the table empty.
  const deleted = await client.query(
    "DELETE FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid",
    [USMCA]
  );
  let n = 0;
  for (const r of rows) {
    await client.query(
      `INSERT INTO catalogs.lane_mileage (
         operating_company_id, origin_city, origin_state, dest_city, dest_state,
         practical_miles, empty_miles, n_practical, practical_spread,
         confidence, autofill_allowed, source, first_seen, last_seen
       ) VALUES (
         $1::uuid, $2, $3, $4, $5,
         $6::numeric, $7::numeric, $8::int, $9::numeric,
         $10, $11, $12, $13::date, $14::date
       )`,
      [
        USMCA,
        r.origin_city,
        r.origin_state,
        r.dest_city,
        r.dest_state,
        r.practical_miles,
        r.empty_miles,
        r.n_practical,
        r.practical_spread,
        r.confidence,
        r.autofill_allowed,
        r.source,
        r.first_seen,
        r.last_seen,
      ]
    );
    n += 1;
  }
  await client.query("COMMIT");
  // The bypass above was set LOCAL (third arg true) and auto-reset at COMMIT. Worse: under this
  // pooler's transaction-mode pgbouncer, a bare autocommit statement issued OUTSIDE any explicit
  // BEGIN/COMMIT can land on a DIFFERENT backend than the one before it (confirmed live: even
  // re-issuing set_config as its own statement here still read back count=0) -- RESET ROLE +
  // set_config + the count SELECT must all run inside ONE explicit transaction to guarantee
  // they share a backend, exactly like the write block above did.
  await client.query("BEGIN");
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const c = await client.query(
    "SELECT count(*)::int AS n FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid",
    [USMCA]
  );
  await client.query("COMMIT");
  console.log(
    `deleted ${deleted.rowCount} prior rows; inserted ${n} rows (${skipped.length} skipped for data quality); table count ${c.rows[0].n}`
  );
  if (c.rows[0].n !== n) {
    console.error(`VERIFICATION FAILED — inserted ${n} but live table count is ${c.rows[0].n}`);
    await client.end();
    process.exit(1);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
