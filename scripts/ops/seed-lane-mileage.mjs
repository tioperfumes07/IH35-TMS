#!/usr/bin/env node
/**
 * Seed catalogs.lane_mileage from db/seeds/lane-mileage-usmca.csv. Reference data only.
 * USMCA company 5c854333-6ea5-4faa-af31-67cb272fef80.
 *
 * REBUILD (2026-09-04, LANE-MILEAGE-SHORT-EMPTY-DROPPED): replaced the 2026-09-03 3093-row
 * AlwaysTrack extract (no short-route data at all) with the owner's fuller
 * ~/Downloads/lane_mileage_seed.csv (3466 rows) -- this source carries short_miles, n_short,
 * short_min, short_max, and real (not derived) practical_min/practical_max/practical_spread for
 * every lane that has them. The PRIOR version of this file mapped a source with no short-route
 * columns at all and correctly left them NULL; carrying that same "always NULL" mapping forward
 * onto THIS richer source silently discarded real data the owner's file actually has -- that was
 * the defect (owner-verified live 2026-09-04: 3,006 live lanes, 0 with short_miles/empty_miles
 * populated, despite the source having short_miles on 3,361/3,466 and empty_miles > 0 on most).
 *
 * FIELD MAPPING (this source's own column names, no renaming needed for most):
 *   practical_miles / short_miles / empty_miles / n_practical / n_short / practical_min /
 *   practical_max / practical_spread / short_min / short_max -- pass through directly, blank ->
 *   NULL (this source marks "no observation" with a genuinely blank field, not a fabricated 0;
 *   the one exception is empty_miles, whose own convention in this source is a real "0.0" for "no
 *   deadhead observed", left as 0, not NULL, matching the table's pre-existing use of 0 there).
 *   n_practical / n_short: blank -> NULL is wrong for a count -- 0 when blank (matches the
 *   source's own convention of writing n_short="0" whenever short_miles is blank).
 *   trust_level: high -> 'High' ; check_zip -> 'Check ZIP' ; thin -> 'Thin' (this table's own
 *   3-bucket CHECK(confidence), already exactly this source's 3 buckets, no lossy remap needed
 *   this time). autofill_allowed is NOT a source column (unlike the 2026-09-03 source) --
 *   computed from confidence per the owner-approved formula (High or Check ZIP -> true),
 *   matching scripts/ops/merge-and-rescore-lane-mileage.mjs's own scoreConfidence().
 *   source: "history" (always, this file) -> 'History', matching the table's existing convention.
 *   origin_postal_code / dest_postal_code: present as columns in this source, 0/3466 populated --
 *   passed through as NULL when blank (nothing to lose either way).
 *
 * LIVE SCHEMA COLLISIONS (found 2026-09-04 re-running this rebuild against the real table --
 * neither is fixable from this file without fabricating data, both are filed to
 * docs/audit/GUARD-WORKORDERS.md as migration-blocked packages for CC-1/Cursor):
 *
 *   (a) catalogs.lane_mileage.practical_miles is NOT NULL live. 26 of 3466 source rows have every
 *       practical_* field blank (a lane observed only via a short-route data point, e.g.
 *       ADRIAN,PA->LAREDO,TX: blank practical_miles, short_miles=338.4, n_short=1). These rows are
 *       SKIPPED here (not inserted with a fabricated 0 or a copied short_miles value) -- see
 *       skipped[].reason === "no-practical-miles". Once a migration drops this NOT NULL (or the
 *       table gains a nullable-practical path), re-running this script picks them up with no code
 *       change.
 *   (b) catalogs.lane_mileage has CHECK lane_mileage_short_miles_not_over_practical (short_miles
 *       IS NULL OR short_miles <= practical_miles). The owner's 2026-09-04 ruling is that short is
 *       NOT bounded by practical in this source -- it's the AlwaysTrack shortest+deadhead blend, a
 *       genuinely different measure that exceeds practical on 2,203 of 3,335 lanes with both values
 *       (median ratio 1.067; verified live against this exact source). Any row where short_miles >
 *       practical_miles has its short_miles/n_short/short_min/short_max HELD to NULL/0 here --
 *       tracked via heldBackForShortConstraint -- rather than either failing the whole import or
 *       silently deriving/capping short from practical (the owner explicitly forbade deriving:
 *       "Any formula would fabricate driver pay"). Until CC-1/Cursor ships a migration relaxing or
 *       dropping this CHECK, these lanes autofill short=NULL exactly like the original bug (see
 *       book-load.service.ts's practical fallback) -- but now for a known, bounded, documented set
 *       of lanes instead of silently, for all of them. Re-running this script after that migration
 *       lands picks up every held-back value with no code change.
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
  let heldBackForShortConstraint = 0;
  for (const r of rawRows) {
    const originCity = r.origin_city.trim();
    const destCity = r.dest_city.trim();
    if (ZIP_RE.test(originCity) || ZIP_RE.test(destCity)) {
      skipped.push({ row: r, reason: "zip-as-city" });
      continue;
    }
    const practicalMiles = num(r.practical_miles);
    if (practicalMiles == null) {
      // catalogs.lane_mileage.practical_miles is NOT NULL live -- see header note (a). Skipping,
      // never fabricating a 0 or copying short_miles into it.
      skipped.push({ row: r, reason: "no-practical-miles" });
      continue;
    }
    const confidence = mapConfidence(r.trust_level);
    let shortMiles = num(r.short_miles);
    let nShort = intOrZero(r.n_short);
    let shortMin = num(r.short_min);
    let shortMax = num(r.short_max);
    if (shortMiles != null && shortMiles > practicalMiles) {
      // Live CHECK lane_mileage_short_miles_not_over_practical -- see header note (b). Hold the
      // whole short-route bundle to NULL/0 for this lane rather than deriving/capping it.
      heldBackForShortConstraint += 1;
      shortMiles = null;
      nShort = 0;
      shortMin = null;
      shortMax = null;
    }
    rows.push({
      origin_city: originCity,
      origin_state: r.origin_state.trim(),
      origin_postal_code: r.origin_postal_code?.trim() || null,
      dest_city: destCity,
      dest_state: r.dest_state.trim(),
      dest_postal_code: r.dest_postal_code?.trim() || null,
      practical_miles: practicalMiles,
      short_miles: shortMiles,
      empty_miles: num(r.empty_miles) ?? 0,
      n_practical: intOrZero(r.n_practical),
      n_short: nShort,
      practical_min: num(r.practical_min),
      practical_max: num(r.practical_max),
      practical_spread: num(r.practical_spread),
      short_min: shortMin,
      short_max: shortMax,
      confidence,
      autofill_allowed: confidence === "High" || confidence === "Check ZIP",
      source: "History",
      first_seen: r.first_seen || null,
      last_seen: r.last_seen || null,
    });
  }
  return { rows, skipped, heldBackForShortConstraint };
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
  const { rows: built, skipped, heldBackForShortConstraint } = buildInsertRows(rows);
  // ADRIAN has no practical_miles (NOT NULL live) -> skipped, same bucket as the zip-as-city row.
  if (built.length !== 3 || skipped.length !== 2) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected 3 built + 2 skipped, got ${built.length}/${skipped.length}`);
    process.exit(1);
  }
  if (!skipped.some((s) => s.reason === "zip-as-city") || !skipped.some((s) => s.reason === "no-practical-miles")) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected both skip reasons present: ${JSON.stringify(skipped.map((s) => s.reason))}`);
    process.exit(1);
  }
  if (built[0].confidence !== "High" || built[0].source !== "History") {
    console.error("seed-lane-mileage SELFTEST FAIL — confidence/source mapping wrong");
    process.exit(1);
  }
  if (built[0].short_miles !== 280.5 || built[0].n_short !== 2 || built[0].short_min !== 275.0 || built[0].short_max !== 285.0) {
    console.error(`seed-lane-mileage SELFTEST FAIL — short-route fields not carried through: ${JSON.stringify(built[0])}`);
    process.exit(1);
  }
  const omaha = built.find((b) => b.origin_city === "OMAHA");
  if (!omaha || omaha.n_short !== 0 || omaha.short_miles !== null) {
    console.error(`seed-lane-mileage SELFTEST FAIL — blank short_miles must stay NULL with n_short=0, not fabricated: ${JSON.stringify(omaha)}`);
    process.exit(1);
  }
  // Live CHECK lane_mileage_short_miles_not_over_practical: short (1478.1) > practical (1319.7) --
  // must be inserted (not skipped) with the short bundle held to NULL/0, not derived or capped.
  const indy = built.find((b) => b.origin_city === "INDIANAPOLIS");
  if (!indy || indy.practical_miles !== 1319.7 || indy.short_miles !== null || indy.n_short !== 0 || indy.short_min !== null || indy.short_max !== null) {
    console.error(`seed-lane-mileage SELFTEST FAIL — short>practical row must hold the short bundle to NULL/0, not derive/cap it: ${JSON.stringify(indy)}`);
    process.exit(1);
  }
  if (heldBackForShortConstraint !== 1) {
    console.error(`seed-lane-mileage SELFTEST FAIL — expected heldBackForShortConstraint=1, got ${heldBackForShortConstraint}`);
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
  const { rows, skipped, heldBackForShortConstraint } = buildInsertRows(raw);
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
    `held ${heldBackForShortConstraint} lanes' short-route bundle to NULL/0 -- live CHECK lane_mileage_short_miles_not_over_practical blocks writing short>practical; see header note (b) and GUARD-WORKORDERS for the pending migration`
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
