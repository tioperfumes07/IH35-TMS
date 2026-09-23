#!/usr/bin/env node
/**
 * FEED READINESS GATE — IH35-TMS / USMCA — Claude Lead, 2026-09-23
 *
 * Runs AFTER the purge is verified and BEFORE day 1 is fed. It answers one question:
 * does every name in the feed payload resolve to exactly ONE surviving master row?
 *
 * WHY THIS EXISTS
 * The purge deletes transactions and keeps the masters — drivers, customers, vendors,
 * units, the item catalog. The feed then references those masters BY NAME, because the
 * settlement documents carry names, not ids. Three things can go wrong and every one of
 * them is silent:
 *   MISSING    — the name resolves to nothing, and the feeder either fails 124 times or,
 *                worse, auto-creates a duplicate master.
 *   AMBIGUOUS  — the name resolves to TWO active rows. This is the Samsara duplicate-driver
 *                problem: one human, two driver records. Feed 124 loads against that and
 *                half a driver's pay lands on a person who does not exist. It is far cheaper
 *                to catch here than to unwind afterwards.
 *   INACTIVE   — the row survived but is deactivated, so the feed silently skips it.
 *
 * READ ONLY. Never writes. Fails closed with no DATABASE_URL.
 * USAGE  node verify-feed-readiness.mjs [--day YYYY-MM-DD]
 */
import { readFileSync, existsSync } from 'node:fs';

const CO = '5c854333-6ea5-4faa-af31-67cb272fef80';
const PAYLOAD = 'feed_input.json';
const CATALOG = 'item_catalog_seed.csv';

const norm = (s) => (s || '').toString().normalize('NFKD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();

function fail(m) { console.error(m); process.exit(1); }

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) fail('REFUSED: no DATABASE_URL. This gate fails closed — it never reports a ' +
                 'readiness it did not measure.');
  if (!existsSync(PAYLOAD)) fail(`REFUSED: ${PAYLOAD} not found. Build it first.`);
  const { neon } = await import('@neondatabase/serverless')
    .catch(() => fail('REFUSED: @neondatabase/serverless not installed'));
  const raw = neon(url);
  const q = async (text) => raw.transaction
    ? raw.transaction((t) => [t`SET LOCAL app.bypass_rls = 'lucia'`, t.unsafe(text)]).then(r => r[1])
    : raw(text);

  const day = (process.argv.includes('--day'))
    ? process.argv[process.argv.indexOf('--day') + 1] : null;
  let records = JSON.parse(readFileSync(PAYLOAD, 'utf8')).records;
  if (day) records = records.filter(r => r.period_end === day);
  if (!records.length) fail(`REFUSED: no records${day ? ` for ${day}` : ''}.`);

  // every distinct name the payload will reference
  const want = {
    driver: new Set(), customer: new Set(), unit: new Set(),
    trailer: new Set(), item: new Set(),
  };
  for (const r of records) {
    if (r.driver_name) want.driver.add(r.driver_name);
    if (r.customer_name) want.customer.add(r.customer_name);
    if (r.truck) want.unit.add(r.truck);
    if (r.trailer) want.trailer.add(r.trailer);
    for (const l of r.lines) want.item.add(`${l.item_category}::${l.item_name}`);
  }

  const SRC = [
    ['driver', want.driver,
     `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), driver_name) AS nm
        FROM mdata.drivers
       WHERE operating_company_id = '${CO}' AND deactivated_at IS NULL`],
    ['customer', want.customer,
     `SELECT customer_name AS nm FROM mdata.customers
       WHERE operating_company_id = '${CO}' AND COALESCE(is_sample_data,false) = false`],
    ['unit', want.unit,
     `SELECT unit_number AS nm FROM mdata.units WHERE operating_company_id = '${CO}'`],
    ['trailer', want.trailer,
     `SELECT unit_number AS nm FROM mdata.units WHERE operating_company_id = '${CO}'`],
    ['item', want.item,
     `SELECT CONCAT(COALESCE(c.name,''), '::', i.item_name) AS nm
        FROM catalogs.items i
        LEFT JOIN catalogs.item_categories c ON c.id = i.category_id
       WHERE i.operating_company_id = '${CO}' AND i.deactivated_at IS NULL`],
  ];

  let missing = 0, ambiguous = 0;
  for (const [kind, wanted, sql] of SRC) {
    if (!wanted.size) continue;
    let have;
    try { have = await q(sql); }
    catch (e) {
      console.log(`\n${kind.toUpperCase()}: CANNOT CHECK — ${String(e.message).split('\n')[0]}`);
      missing += wanted.size; continue;
    }
    const index = new Map();
    for (const row of have) {
      const k = norm(row.nm);
      if (!k) continue;
      index.set(k, (index.get(k) || 0) + 1);
    }
    const miss = [], dupe = [];
    for (const w of wanted) {
      const n = index.get(norm(w)) || 0;
      if (n === 0) miss.push(w);
      else if (n > 1) dupe.push(`${w}  (${n} active rows)`);
    }
    missing += miss.length; ambiguous += dupe.length;
    console.log(`\n${kind.toUpperCase()}  referenced ${wanted.size}  ·  resolved ` +
                `${wanted.size - miss.length - dupe.length}  ·  missing ${miss.length}  ·  ` +
                `AMBIGUOUS ${dupe.length}`);
    for (const m of miss.slice(0, 15)) console.log(`   MISSING    ${m}`);
    for (const d of dupe.slice(0, 15)) console.log(`   AMBIGUOUS  ${d}   <- ONE HUMAN, TWO ROWS`);
  }

  console.log('\n' + '-'.repeat(70));
  if (missing || ambiguous) {
    console.error(`FEED NOT READY — ${missing} missing, ${ambiguous} ambiguous. DO NOT FEED.`);
    if (ambiguous) console.error(
      'An AMBIGUOUS name is the dangerous one: the feeder picks one of two rows and half a\n' +
      "driver's pay lands on a person who does not exist. Merge the duplicate masters first.");
    process.exit(1);
  }
  console.log(`FEED READY${day ? ` for ${day}` : ''}. Every driver, customer, unit, trailer and ` +
              'item in the payload resolves to exactly one active master row.');
}
main().catch(e => fail('REFUSED: ' + e.message));
