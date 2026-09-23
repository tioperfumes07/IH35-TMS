#!/usr/bin/env node
// R-102-E GUARD -- verify-no-sample-data-holds-a-real-number.mjs
//
// FAILS if any is_sample_data=true mdata.loads row (USMCA) holds a load_number that appears in
// the settlement-refeed's own feed_input.json 124-load list -- that is the exact shape that
// breaks Feed Day 1 on mdata.loads' own UNIQUE(operating_company_id, load_number), which is NOT
// partial (excludes neither soft_deleted_at nor is_sample_data).
//
// ALSO FAILS if any of the three denormalized load_number copies
// (driver_finance.driver_bills.load_number, driver_finance.driver_settlement_gl_bills.load_number,
// expense_attribution.expense_load_links.load_number) names a load_number that no LIVE
// mdata.loads row currently carries for that same load_id -- i.e. the copy still names the OLD
// (pre-renumber) number instead of tracking the header by load_id the way it must.
//
// Fail-closed: no DATABASE_URL, no feed_input.json, or any query error is a FAIL, never a skip.
// Reads live DB only -- never writes.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FEED_INPUT_PATH = process.env.FEED_INPUT_JSON_PATH || path.join(os.homedir(), "Downloads", "feed_input.json");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail("DATABASE_URL not set -- refusing to pass a money-adjacent guard that never ran against a live DB.");
    return;
  }

  if (!fs.existsSync(FEED_INPUT_PATH)) {
    fail(`feed_input.json not found at ${FEED_INPUT_PATH} (set FEED_INPUT_JSON_PATH to override) -- refusing to pass without the real feed-number list.`);
    return;
  }
  let feedInput;
  try {
    feedInput = JSON.parse(fs.readFileSync(FEED_INPUT_PATH, "utf8"));
  } catch (e) {
    fail(`feed_input.json failed to parse: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const records = Array.isArray(feedInput?.records) ? feedInput.records : null;
  if (!records) {
    fail("feed_input.json has no .records array -- shape has changed, refusing to guess a fallback field.");
    return;
  }
  const feedLoadNumbers = new Set(records.map((r) => String(r.load_number)).filter(Boolean));
  if (feedLoadNumbers.size === 0) {
    fail("feed_input.json .records produced zero load_number values -- refusing to pass a guard with an empty deny-list.");
    return;
  }
  console.log(`Loaded ${feedLoadNumbers.size} feed load_number(s) from ${FEED_INPUT_PATH}.`);

  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

    // Check 1: no is_sample_data row holds a feed load_number.
    const sampleRes = await client.query(
      `SELECT id::text, load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND is_sample_data = true`,
      [USMCA_COMPANY_ID]
    );
    const collisions = sampleRes.rows.filter((r) => feedLoadNumbers.has(r.load_number));
    console.log(`Sample loads holding a feed number: ${collisions.length} (required value: 0)`);
    for (const c of collisions) fail(`is_sample_data load ${c.id} still holds feed load_number "${c.load_number}".`);

    // Check 2: the three denormalized copies point at a number the load itself currently carries.
    const mismatchQueries = [
      { table: "driver_finance.driver_bills", sql: `SELECT db.load_id::text, db.load_number AS copy_number, l.load_number AS real_number
          FROM driver_finance.driver_bills db JOIN mdata.loads l ON l.id = db.load_id
          WHERE l.operating_company_id = $1::uuid AND db.load_number IS DISTINCT FROM l.load_number` },
      { table: "driver_finance.driver_settlement_gl_bills", sql: `SELECT gb.load_id::text, gb.load_number AS copy_number, l.load_number AS real_number
          FROM driver_finance.driver_settlement_gl_bills gb JOIN mdata.loads l ON l.id = gb.load_id
          WHERE l.operating_company_id = $1::uuid AND gb.load_number IS DISTINCT FROM l.load_number` },
      { table: "expense_attribution.expense_load_links", sql: `SELECT ell.load_id::text, ell.load_number AS copy_number, l.load_number AS real_number
          FROM expense_attribution.expense_load_links ell JOIN mdata.loads l ON l.id = ell.load_id
          WHERE l.operating_company_id = $1::uuid AND ell.load_number IS DISTINCT FROM l.load_number` },
    ];
    for (const { table, sql } of mismatchQueries) {
      const res = await client.query(sql, [USMCA_COMPANY_ID]);
      console.log(`${table}: stale load_number copies: ${res.rowCount} (required value: 0)`);
      for (const row of res.rows) {
        fail(`${table} load_id=${row.load_id} carries load_number "${row.copy_number}" but mdata.loads for that id now reads "${row.real_number}".`);
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    fail(`query error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    client.release();
    await pool.end();
  }

  if (process.exitCode !== 1) {
    console.log("PASS -- no sample-data row holds a real feed load_number, and all three denormalized copies match their load's current number.");
  }
}

await main();
