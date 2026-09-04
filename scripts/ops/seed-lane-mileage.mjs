#!/usr/bin/env node
/**
 * Seed catalogs.lane_mileage from db/seeds/lane-mileage-usmca.csv. Reference data only.
 * USMCA company 5c854333-6ea5-4faa-af31-67cb272fef80.
 *
 * REVERSED 2026-09-04 (LANE-MILEAGE-SHORT-MILES-REGRESSION, owner order, URGENT, owner's own
 * fault -- read in full before touching this file again): the 2026-09-04 REBUILD below (kept for
 * history, do not repeat its reasoning) imported this source's short_miles/n_short/short_min/
 * short_max columns verbatim, believing them to be a genuine shortest-route observation distinct
 * from practical_miles. They are NOT. This CSV's short_miles column is AlwaysTrack St. Miles =
 * Loaded Miles + Empty Miles -- the SAME shortest-plus-deadhead blend
 * docs/bus/MILES-SPEC-DISPATCH-FINAL-2026-09-02.md already forbids storing as one number, and the
 * owner's own current-state law is explicit: never derive one mileage from another, and this
 * source carries NO independent shortest-route figure at all. Importing it into short_miles pays
 * deadhead TWICE (once via short_miles, again via miles_deadhead) the moment a load's driver pay
 * is computed on it. A true loaded-shortest figure comes ONLY from the self-hosted OSM routing
 * engine (apps/backend/src/dispatch/mileage/osrm.provider.ts) -- not wired into this import, not
 * wired into book/edit load yet (see docs/bus/findings/2026-09-04-cc1-mileage-engine-integration-
 * finding.md )-- never from this CSV.
 *
 * short_miles / short_min / short_max are therefore ALWAYS NULL on import from this source,
 * n_short is ALWAYS 0, REGARDLESS of what the CSV's own short_miles/n_short/short_min/short_max
 * columns contain. This is not a holdback pending a schema fix (the 2026-09-04 REBUILD's framing
 * below, now superseded) -- there is no future migration or trigger that makes this source's
 * short_miles column trustworthy, because the column itself measures the wrong thing. Do not
 * re-map it verbatim again without a NEW, different source that actually carries an independent
 * shortest-route figure.
 *
 * empty_miles: per the same law, deadhead is a TRIP property (the assigned unit's real previous
 * delivery, computed by chain-deadhead.service.ts / GO-23), never a lane average -- a lane-level
 * empty_miles must never feed pay. Live-verified 2026-09-04: nothing in the codebase reads
 * catalogs.lane_mileage.empty_miles into miles_deadhead or any pay computation (grep-confirmed,
 * both backend and frontend) -- GO-23's chain-deadhead is the sole live producer. empty_miles is
 * therefore left populated here (informational only, matches this source's own convention, no
 * live money-path consumer) rather than nulled -- the owner's own instruction is not to delete
 * rows/columns to hit a number; this is a value that is unused, not one that is actively wrong in
 * a load-bearing sense. If a future PR ever wires empty_miles into a pay/cost path, that PR is the
 * one that must NOT do so, per this same law.
 *
 * practical_miles / practical_min / practical_max / practical_spread / n_practical: UNCHANGED by
 * this reversal -- these are the loaded PRACTICAL route figures, a real, independent measure this
 * source genuinely carries, never implicated in the blend defect.
 *
 * ==================== 2026-09-04 REBUILD (SUPERSEDED, kept for history only) ====================
 * REBUILD (2026-09-04, LANE-MILEAGE-SHORT-EMPTY-DROPPED): replaced the 2026-09-03 3093-row
 * AlwaysTrack extract (no short-route data at all) with the owner's fuller
 * ~/Downloads/lane_mileage_seed.csv (3466 rows) -- this source carries short_miles, n_short,
 * short_min, short_max, and real (not derived) practical_min/practical_max/practical_spread for
 * every lane that has them. The PRIOR version of this file mapped a source with no short-route
 * columns at all and correctly left them NULL; carrying that same "always NULL" mapping forward
 * onto THIS richer source silently discarded real data the owner's file actually has -- that was
 * BELIEVED to be the defect (owner-verified live 2026-09-04: 3,006 live lanes, 0 with
 * short_miles/empty_miles populated, despite the source having short_miles on 3,361/3,466 and
 * empty_miles > 0 on most). THIS ANALYSIS WAS WRONG for short_miles specifically -- see the
 * REVERSED note above. "Always NULL" was in fact the CORRECT mapping for short_miles all along;
 * it was simply mis-diagnosed as a bug because nobody had yet read that this source's short_miles
 * column is the blend, not an independent figure.
 *
 * FIELD MAPPING (this source's own column names, no renaming needed for most):
 *   practical_miles / empty_miles / n_practical / practical_min / practical_max /
 *   practical_spread -- pass through directly, blank -> NULL (this source marks "no observation"
 *   with a genuinely blank field, not a fabricated 0; the one exception is empty_miles, whose own
 *   convention in this source is a real "0.0" for "no deadhead observed", left as 0, not NULL,
 *   matching the table's pre-existing use of 0 there).
 *   short_miles / short_min / short_max / n_short: ALWAYS NULL/NULL/NULL/0 -- see REVERSED note
 *   above. The source's own values for these four columns are read (for the selftest's own
 *   regression proof that they are correctly discarded) but never written to the row.
 *   n_practical: blank -> NULL is wrong for a count -- 0 when blank.
 *   trust_level: high -> 'High' ; check_zip -> 'Check ZIP' ; thin -> 'Thin' (this table's own
 *   3-bucket CHECK(confidence), already exactly this source's 3 buckets, no lossy remap needed
 *   this time). autofill_allowed is NOT a source column (unlike the 2026-09-03 source) --
 *   computed from confidence per the owner-approved formula (High or Check ZIP -> true),
 *   matching scripts/ops/merge-and-rescore-lane-mileage.mjs's own scoreConfidence().
 *   source: "history" (always, this file) -> 'History', matching the table's existing convention.
 *   origin_postal_code / dest_postal_code: present as columns in this source, 0/3466 populated --
 *   passed through as NULL when blank (nothing to lose either way).
 *
 * LIVE SCHEMA COLLISIONS (found 2026-09-04, RESOLVED same day by CC-1's migration 202613670001):
 * two constraints on catalogs.lane_mileage briefly blocked a full re-import -- both are DROPPED
 * live. Kept here because the migration itself is still correct and permanent (the schema should
 * not force practical_miles NOT NULL, and should not hard-reject short>practical at the DB layer
 * even though THIS script now never writes a short_miles value that could trip it):
 *
 *   (a) catalogs.lane_mileage.practical_miles WAS NOT NULL live. 26 of 3466 source rows have every
 *       practical_* field blank (a lane observed only via a short-route data point in the source,
 *       e.g. ADRIAN,PA->LAREDO,TX). Migration 202613670001 dropped the NOT NULL -- these 26 rows
 *       import with practical_miles=NULL, never a fabricated 0 or a copied short_miles value.
 *   (b) catalogs.lane_mileage HAD CHECK lane_mileage_short_miles_not_over_practical. Migration
 *       202613670001 dropped this CHECK. This script no longer writes short_miles at all from
 *       this source, so the constraint is now moot for THIS writer, but the migration remains
 *       correct: MILES-INVERT-01's recompute_lane_short_miles_trust() trigger (already live)
 *       stays the correct flag-not-reject mechanism for any FUTURE, genuinely independent
 *       short-route source that does legitimately exceed practical on some lanes.
 * ================================================================================================
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
function intOrZero(v) {
  const n = num(v);
  return n == null ? 0 : Math.trunc(n);
}
function mapConfidence(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "high") return "High";
  if (v === "check_zip") return "Check ZIP";
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
      skipped.push({ row: r, reason: "zip-as-city" });
      continue;
    }
    if (num(r.practical_miles) == null) {
      // LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04): catalogs.lane_mileage.
      // practical_miles is NOT NULL again (migration 202613680001 restored it). A row whose only
      // source content was short_miles (now always discarded -- see above) carries zero
      // legitimate mileage information and must be skipped, never inserted with a fabricated
      // practical_miles and never inserted in violation of the constraint.
      skipped.push({ row: r, reason: "no-practical-miles" });
      continue;
    }
    const confidence = mapConfidence(r.trust_level);
    rows.push({
      origin_city: originCity,
      origin_state: r.origin_state.trim(),
      origin_postal_code: r.origin_postal_code?.trim() || null,
      dest_city: destCity,
      dest_state: r.dest_state.trim(),
      dest_postal_code: r.dest_postal_code?.trim() || null,
      practical_miles: num(r.practical_miles),
      // LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04): this source's short_miles/
      // short_min/short_max/n_short columns are the AlwaysTrack St. Miles blend (Loaded + Empty),
      // never an independent shortest-route figure -- ALWAYS NULL/NULL/NULL/0, regardless of what
      // the source row carries. Do NOT re-map these verbatim again. See the file header.
      short_miles: null,
      empty_miles: num(r.empty_miles) ?? 0,
      n_practical: intOrZero(r.n_practical),
      n_short: 0,
      practical_min: num(r.practical_min),
      practical_max: num(r.practical_max),
      practical_spread: num(r.practical_spread),
      short_min: null,
      short_max: null,
      confidence,
      autofill_allowed: confidence === "High" || confidence === "Check ZIP",
      source: "History",
      first_seen: r.first_seen || null,
      last_seen: r.last_seen || null,
    });
  }
  return { rows, skipped };
}

if (process.argv.includes("--selftest")) {
  const rows = parseCsv(
    "origin_city,origin_state,origin_postal_code,dest_city,dest_state,dest_postal_code,practical_miles,short_miles,empty_miles,n_practical,n_short,practical_min,practical_max,practical_spread,short_min,short_max,trust_level,source,first_seen,last_seen\n" +
      '"Shippensburg, Pa",PA,,Laredo,TX,,292.2,280.5,10.0,3,2,285.0,300.0,5.0,275.0,285.0,high,history,2026-01-01,2026-02-01\n' +
      "78045,TX,,Jersey City,NJ,,1970.9,,0.0,1,0,1970.9,1970.9,0.0,,,thin,history,2026-07-23,2026-07-23\n" +
      "ADRIAN,PA,,LAREDO,TX,,,338.4,,,1,,,,338.4,338.4,thin,history,,\n" +
      "OMAHA,NE,,LAREDO,TX,,900.0,,5.0,4,0,895.0,905.0,10.0,,,check_zip,history,2026-01-01,2026-01-01\n" +
      "INDIANAPOLIS,IN,,LAREDO,TX,,1319.7,1478.1,207.6,7,7,1318.6,1345.7,27.1,1303.9,1552.5,check_zip,history,2023-01-18,2026-08-07\n"
  );
  if (rows.length !== 5 || rows[0].origin_city !== "Shippensburg, Pa") {
    console.error("seed-lane-mileage SELFTEST FAIL — quoted city / header parse");
    process.exit(1);
  }
  const { rows: built, skipped } = buildInsertRows(rows);
  // zip-as-city (78045) and ADRIAN (blank practical_miles -- constraint restored 2026-09-04) are
  // both skipped. Shippensburg/OMAHA/INDIANAPOLIS are built, all with short_miles discarded.
  if (built.length !== 3 || skipped.length !== 2) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected 3 built + 2 skipped, got ${built.length}/${skipped.length}`);
    process.exit(1);
  }
  if (skipped[0].reason !== "zip-as-city") {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected the one skip to be zip-as-city, got ${skipped[0].reason}`);
    process.exit(1);
  }
  if (built[0].confidence !== "High" || built[0].source !== "History") {
    console.error("seed-lane-mileage SELFTEST FAIL — confidence/source mapping wrong");
    process.exit(1);
  }
  // LANE-MILEAGE-SHORT-MILES-REGRESSION (owner order 2026-09-04): short_miles/short_min/
  // short_max/n_short must be discarded ALWAYS, regardless of the source row's own content --
  // the source's short_miles column is the AlwaysTrack blend, never an independent shortest-route
  // figure. This is the opposite assertion of the pre-2026-09-04-URGENT version of this test.
  if (built[0].short_miles !== null || built[0].n_short !== 0 || built[0].short_min !== null || built[0].short_max !== null) {
    console.error(`seed-lane-mileage SELFTEST FAIL — short-route fields must always be discarded, never carried through: ${JSON.stringify(built[0])}`);
    process.exit(1);
  }
  const omaha = built.find((b) => b.origin_city === "OMAHA");
  if (!omaha || omaha.n_short !== 0 || omaha.short_miles !== null) {
    console.error(`seed-lane-mileage SELFTEST FAIL — blank short_miles must stay NULL with n_short=0, not fabricated: ${JSON.stringify(omaha)}`);
    process.exit(1);
  }
  // The exact real-world shape LANE-MILEAGE-SHORT-MILES-REGRESSION restores: practical_* all
  // blank, short_miles present in the source. practical_miles is NOT NULL again (migration
  // 202613680001 restored it) -- this row must be SKIPPED, not built with a null practical_miles.
  const adrianLike = built.find((b) => b.origin_city === "ADRIAN");
  if (adrianLike) {
    console.error(`seed-lane-mileage SELFTEST FAIL — a row with blank practical_miles must be skipped (constraint restored), not built: ${JSON.stringify(adrianLike)}`);
    process.exit(1);
  }
  if (!skipped.some((s) => s.reason === "no-practical-miles" && s.row.origin_city === "ADRIAN")) {
    console.error("seed-lane-mileage SELFTEST FAIL — the blank-practical row must appear in skipped with reason no-practical-miles");
    process.exit(1);
  }
  // The exact real-world shape the owner named directly: source short_miles=1478.1 on a real
  // practical=1319.7 lane -- must import with short_miles NULL, never the blend value, never
  // derived/capped from practical (deriving short = short - empty, or capping at practical, are
  // both forbidden -- §2: never derive one mileage from another).
  const indy = built.find((b) => b.origin_city === "INDIANAPOLIS");
  if (!indy || indy.practical_miles !== 1319.7 || indy.short_miles !== null || indy.n_short !== 0 || indy.short_min !== null || indy.short_max !== null) {
    console.error(`seed-lane-mileage SELFTEST FAIL — the load-13508-shaped lane must import short_miles=NULL, never the blend value: ${JSON.stringify(indy)}`);
    process.exit(1);
  }
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  if (!/TRUNCATE/.test(src) && !/DELETE FROM catalogs\.lane_mileage/.test(src)) {
    console.error("seed-lane-mileage SELFTEST FAIL — full-replace delete missing (rebuild must not silently upsert-only)");
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
  if (raw.length !== 3466) {
    console.error(`expected 3466 source rows, got ${raw.length}`);
    process.exit(1);
  }
  const { rows, skipped } = buildInsertRows(raw);
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
  const deleted = await client.query(
    "DELETE FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid",
    [USMCA]
  );
  let n = 0;
  const colsBefore = {
    short_miles: 0,
    n_short_gt0: 0,
    empty_miles_gt0: 0,
    practical_min: 0,
    practical_max: 0,
    short_min: 0,
    short_max: 0,
  };
  for (const r of rows) {
    await client.query(
      `INSERT INTO catalogs.lane_mileage (
         operating_company_id, origin_city, origin_state, origin_postal_code,
         dest_city, dest_state, dest_postal_code,
         practical_miles, short_miles, empty_miles, n_practical, n_short,
         practical_min, practical_max, practical_spread, short_min, short_max,
         confidence, autofill_allowed, source, first_seen, last_seen
       ) VALUES (
         $1::uuid, $2, $3, $4,
         $5, $6, $7,
         $8::numeric, $9::numeric, $10::numeric, $11::int, $12::int,
         $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::numeric,
         $18, $19, $20, $21::date, $22::date
       )`,
      [
        USMCA,
        r.origin_city,
        r.origin_state,
        r.origin_postal_code,
        r.dest_city,
        r.dest_state,
        r.dest_postal_code,
        r.practical_miles,
        r.short_miles,
        r.empty_miles,
        r.n_practical,
        r.n_short,
        r.practical_min,
        r.practical_max,
        r.practical_spread,
        r.short_min,
        r.short_max,
        r.confidence,
        r.autofill_allowed,
        r.source,
        r.first_seen,
        r.last_seen,
      ]
    );
    n += 1;
    if (r.short_miles != null) colsBefore.short_miles += 1;
    if (r.n_short > 0) colsBefore.n_short_gt0 += 1;
    if (r.empty_miles > 0) colsBefore.empty_miles_gt0 += 1;
    if (r.practical_min != null) colsBefore.practical_min += 1;
    if (r.practical_max != null) colsBefore.practical_max += 1;
    if (r.short_min != null) colsBefore.short_min += 1;
    if (r.short_max != null) colsBefore.short_max += 1;
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
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE short_miles IS NOT NULL)::int AS short_miles_populated,
       count(*) FILTER (WHERE empty_miles > 0)::int AS empty_miles_gt0,
       count(*) FILTER (WHERE practical_min IS NOT NULL)::int AS practical_min_populated,
       count(*) FILTER (WHERE short_min IS NOT NULL)::int AS short_min_populated
     FROM catalogs.lane_mileage WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  await client.query("COMMIT");
  const skipReasons = skipped.reduce((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `deleted ${deleted.rowCount} prior rows; inserted ${n} rows (${skipped.length} skipped: ${JSON.stringify(skipReasons)})`
  );
  console.log(
    `BEFORE-write counts (from source): short_miles=${colsBefore.short_miles} n_short>0=${colsBefore.n_short_gt0} empty_miles>0=${colsBefore.empty_miles_gt0} practical_min=${colsBefore.practical_min} short_min=${colsBefore.short_min}`
  );
  console.log(`AFTER live table: ${JSON.stringify(c.rows[0])}`);
  if (c.rows[0].total !== n) {
    console.error(`VERIFICATION FAILED — inserted ${n} but live table count is ${c.rows[0].total}`);
    await client.end();
    process.exit(1);
  }
  if (c.rows[0].short_miles_populated !== colsBefore.short_miles) {
    console.error(
      `VERIFICATION FAILED — short_miles populated in source (${colsBefore.short_miles}) does not match live table (${c.rows[0].short_miles_populated})`
    );
    await client.end();
    process.exit(1);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
