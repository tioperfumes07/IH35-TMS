#!/usr/bin/env tsx
// IFTA-GALLONS-04 (Lead, 2026-09-23): the third source for the 118 rows / 12,537.778 gal that
// IFTA-GALLONS-03 (Dreamline statement + Love's 604 seed) genuinely could not resolve --
// integrations.relay_fuel_transactions, the raw Relay ingest staging table (1,707 rows across all
// companies; USMCA buys fuel on TRANSPORTATION's own Relay account per owner ruling, so the real
// match pool is NOT scoped to USMCA's own 76 rows -- reading the wider staging table is explicitly
// authorized this round: "reading TRANSPORTATION-scoped rows ... is authorized. You are reading an
// integration payload, not writing to or reporting on TRANSPORTATION's books.").
//
// FOUR TIERS, IN ORDER, EACH LEAVING THE ROW UNTOUCHED IF IT CANNOT RESOLVE (never a guess):
//
//   TIER 1 -- fuel.fuel_transactions.transaction_reference -> integrations.relay_fuel_transactions.
//   transaction_id, no normalization. MEASURED THIS PASS: 0 matches. transaction_reference on our
//   side is a bare numeric invoice-style string ("1911087", "99822323"); transaction_id on the
//   Relay side is an opaque Relay-native id ("txn_6MahzeKcnvJ8iD") -- confirmed live these two ID
//   spaces never intersect (a full-text search of raw_payload for several sample reference numbers
//   also found zero hits, ruling out the reference living somewhere else in the payload). Reported
//   honestly rather than forced.
//
//   TIER 2 -- exact match: upper(strip-non-alphanumeric(fuel_transactions.location_city)) ==
//   upper(strip-non-alphanumeric(relay_fuel_transactions.location_address)). location_city on our
//   side holds a STREET ADDRESS (IFTA-GALLONS-03's own finding); location_address on the Relay
//   staging side is the real street address field. 32 rows resolve, across 12 distinct normalized
//   addresses, EVERY ONE mapping to exactly 1 distinct state (zero ambiguity) -- confirmed live.
//
//   TIER 3 -- 12-character-prefix match on the same normalized strings, applied ONLY to rows TIER 2
//   left unresolved, and ONLY where the prefix maps to a SINGLE distinct state across the whole
//   staging table (a 2-or-more-state prefix stays NULL, named, never guessed). 37 of the 86
//   TIER-2-unresolved rows resolve this way; live-confirmed zero prefix collisions (every matching
//   prefix in the full 118-row check maps to exactly 1 state).
//
//   TIER 4 -- whatever remains (118 - 32 - 37 = 49 rows) is the REAL residual. Left NULL, reported
//   with count + gallons, never resolved by unit+date guessing.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("ABORT: DATABASE_URL required.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const residual = await client.query<{
    id: string;
    location_city: string | null;
    gallons: string;
    transaction_reference: string | null;
  }>(
    `SELECT id::text, location_city, gallons::text, transaction_reference
       FROM fuel.fuel_transactions
      WHERE operating_company_id = $1::uuid AND archived_at IS NULL
        AND (location_state IS NULL OR TRIM(location_state) = '')`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Scanned ${residual.rowCount} NULL-jurisdiction rows (IFTA-GALLONS-03 residual).`);

  // TIER 1
  const tier1 = await client.query<{ n: string }>(
    `SELECT count(DISTINCT ft.id)::text AS n
       FROM fuel.fuel_transactions ft
       JOIN integrations.relay_fuel_transactions r ON r.transaction_id = ft.transaction_reference
      WHERE ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL
        AND (ft.location_state IS NULL OR TRIM(ft.location_state) = '')`,
    [USMCA_COMPANY_ID]
  );
  console.log(`TIER 1 (transaction_reference -> transaction_id, no normalization): ${tier1.rows[0]!.n} rows`);

  // TIER 2 -- exact normalized address match
  const tier2 = await client.query<{ id: string; gallons: string; state: string }>(
    `WITH res AS (
       SELECT id, gallons, upper(regexp_replace(location_city, '[^a-zA-Z0-9]', '', 'g')) AS norm_city
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND archived_at IS NULL
          AND (location_state IS NULL OR TRIM(location_state) = '')
     ), staging AS (
       SELECT DISTINCT upper(regexp_replace(location_address, '[^a-zA-Z0-9]', '', 'g')) AS norm_addr,
              location_state
         FROM integrations.relay_fuel_transactions
        WHERE location_address IS NOT NULL AND location_state IS NOT NULL
     ), one_state AS (
       SELECT norm_addr, min(location_state) AS state
         FROM staging GROUP BY norm_addr HAVING count(DISTINCT location_state) = 1
     )
     SELECT res.id::text, res.gallons::text, os.state
       FROM res JOIN one_state os ON os.norm_addr = res.norm_city`,
    [USMCA_COMPANY_ID]
  );
  const tier2Gal = tier2.rows.reduce((s, r) => s + Number(r.gallons), 0);
  console.log(`TIER 2 (exact normalized address, single-state only): ${tier2.rowCount} rows / ${tier2Gal.toFixed(3)} gal`);

  const tier2Ids = new Set(tier2.rows.map((r) => r.id));

  // TIER 3 -- 12-char prefix, single-state only, applied to TIER-2-unresolved rows only
  const tier3 = await client.query<{ id: string; gallons: string; state: string }>(
    `WITH res AS (
       SELECT id, gallons, upper(regexp_replace(location_city, '[^a-zA-Z0-9]', '', 'g')) AS norm_city
         FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND archived_at IS NULL
          AND (location_state IS NULL OR TRIM(location_state) = '')
     ), staging AS (
       SELECT DISTINCT left(upper(regexp_replace(location_address, '[^a-zA-Z0-9]', '', 'g')), 12) AS prefix12,
              location_state
         FROM integrations.relay_fuel_transactions
        WHERE location_address IS NOT NULL AND location_state IS NOT NULL
     ), one_state AS (
       SELECT prefix12, min(location_state) AS state
         FROM staging GROUP BY prefix12 HAVING count(DISTINCT location_state) = 1
     )
     SELECT res.id::text, res.gallons::text, os.state
       FROM res JOIN one_state os ON os.prefix12 = left(res.norm_city, 12)`,
    [USMCA_COMPANY_ID]
  );
  const tier3Filtered = tier3.rows.filter((r) => !tier2Ids.has(r.id));
  const tier3Gal = tier3Filtered.reduce((s, r) => s + Number(r.gallons), 0);
  console.log(
    `TIER 3 (12-char prefix, single-state only, TIER-2-unresolved rows only): ${tier3Filtered.length} rows / ${tier3Gal.toFixed(3)} gal`
  );

  const resolvedIds = new Set([...tier2Ids, ...tier3Filtered.map((r) => r.id)]);
  const tier4 = residual.rows.filter((r) => !resolvedIds.has(r.id));
  const tier4Gal = tier4.reduce((s, r) => s + Number(r.gallons), 0);
  console.log(`TIER 4 (real residual, left NULL): ${tier4.length} rows / ${tier4Gal.toFixed(3)} gal`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made. Re-run with --execute to apply TIER 2 + TIER 3.");
    return;
  }

  let applied = 0;
  for (const r of [...tier2.rows, ...tier3Filtered]) {
    await client.query(
      `UPDATE fuel.fuel_transactions SET location_state = $1, updated_at = now(), updated_by_user_id = $2::uuid
         WHERE id = $3::uuid AND operating_company_id = $4::uuid`,
      [r.state, OWNER_USER_ID, r.id, USMCA_COMPANY_ID]
    );
    applied++;
  }
  client.release();
  await pool.end();
  console.log(`\nEXECUTE done: ${applied} rows updated.`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
