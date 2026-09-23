#!/usr/bin/env node
/**
 * PURGE VERIFIER - IH35-TMS / USMCA
 *
 * Runs immediately after the purge and answers one question with evidence: did it delete
 * exactly what it was supposed to, and NOTHING ELSE?
 *
 * A purge that deletes too little leaves contaminated rows the feed collides with.
 * A purge that deletes too much silently destroys the masters the feed depends on - the
 * chart of accounts, the drivers, the banking history - and nobody notices until the feed
 * produces nonsense. Both failures are invisible without this.
 *
 * WHY THIS FILE CHANGED. The previous verifier carried its OWN hand-typed table list. It
 * checked 19 tables while the SQL deleted 38, it named `accounting.journal_entry_lines`
 * which has never existed, and - worst - it counted child tables with NO WHERE CLAUSE, so
 * `mdata.load_stops` was counted across EVERY company. TRANSPORTATION and TRUCKING rows
 * would have made a perfectly good purge report FAIL. It now reads
 * `usmca-purge-expected-zero.generated.json`, emitted by the same run that emits the purge
 * SQL, carrying the exact predicate per table. The SQL and the verifier cannot drift apart.
 *
 * READ ONLY against the database. It never deletes and never posts.
 * Fails closed with no DATABASE_URL: it never reports a pass it did not measure.
 *
 * USAGE  node scripts/purge/verify-purge.mjs --before   capture the baseline, BEFORE the purge
 *        node scripts/purge/verify-purge.mjs            verify, AFTER the purge
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = path.join(HERE, "usmca-purge-expected-zero.generated.json");
const BASELINE = process.env.PURGE_BASELINE_PATH || "purge_baseline.json";

/**
 * The shared purge-state file. Cursor's eight zero-row guard arms read verified_at to decide
 * whether an empty table is "EMPTY BY PURGE" or a broken instrument. WITHOUT THIS WRITE THE
 * WINDOW NEVER OPENS and every seat's money push blocks the moment we purge.
 */
const PURGE_STATE = process.env.PURGE_STATE_PATH || "purge_state.json";

function fail(msg) { console.error(msg); process.exit(1); }

if (!existsSync(EXPECTED))
  fail(`REFUSED: ${EXPECTED} is missing. Regenerate it with scripts/purge/build-usmca-purge.mjs. ` +
       "This guard will not fall back to a hand-typed table list - that is the defect it exists to prevent.");

const spec = JSON.parse(readFileSync(EXPECTED, "utf8"));
const CO = spec.company_id;
const MUST_BE_ZERO = spec.must_be_zero_after_purge;   // [{ table, where }]

/**
 * MUST SURVIVE. Masters, banking, and the compliance documents.
 * docs.files: 475 USMCA rows. 263 are app-generated driver instructions tied to a load and are
 * regenerable. The rest are CDLs, medical cards, insurance certificates, permits and signed
 * contracts hanging off drivers, units and vendors - evidence with nothing to do with a
 * transaction. The 2026-09-22 SQL deleted all 475. It must not.
 */
const MUST_SURVIVE = [
  ["banking.bank_transactions", "BANKING IS NOT PURGED - owner instruction"],
  ["banking.bank_accounts", "bank accounts"],
  ["docs.files", "COMPLIANCE AND OWNER-UPLOADED EVIDENCE - only app-generated load artifacts may go"],
  ["catalogs.accounts", "the chart of accounts"],
  ["catalogs.items", "the item catalog"],
  ["catalogs.qbo_categories", "the item categories"],
  ["mdata.drivers", "drivers"],
  ["mdata.units", "units"],
  ["mdata.customers", "customers"],
  ["mdata.vendors", "vendors"],
  ["mdata.equipment", "equipment"],
  ["mdata.locations", "locations"],
  ["driver_finance.driver_pay_rates", "driver pay rates"],
  ["accounting.periods", "accounting periods"],
];

async function counts(sql) {
  const out = {};
  for (const { table, where } of MUST_BE_ZERO) {
    try { out[table] = Number((await sql(`SELECT count(*) AS n FROM ${table} WHERE ${where}`))[0].n); }
    catch (e) { out[table] = `ERROR: ${String(e.message).split("\n")[0]}`; }
  }
  for (const [table] of MUST_SURVIVE) {
    try {
      out[table] = Number(
        (await sql(`SELECT count(*) AS n FROM ${table} WHERE operating_company_id = '${CO}'`))[0].n,
      );
    } catch (e) { out[table] = `ERROR: ${String(e.message).split("\n")[0]}`; }
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url)
    fail("REFUSED: no DATABASE_URL. This guard fails closed - it never reports a pass it did not measure.");

  const { neon } = await import("@neondatabase/serverless").catch(() =>
    fail("REFUSED: @neondatabase/serverless not installed"));
  const raw = neon(url);
  const sql = async (q) =>
    raw.transaction
      ? raw
          .transaction((t) => [t`SET LOCAL app.bypass_rls = 'lucia'`, t.unsafe ? t.unsafe(q) : t(q)])
          .then((r) => r[1])
      : raw(q);

  const before = process.argv.includes("--before");
  const now = await counts(sql);

  if (before) {
    writeFileSync(BASELINE, JSON.stringify({ captured: new Date().toISOString(), counts: now }, null, 1));
    console.log(`BASELINE CAPTURED - ${BASELINE}`);
    for (const [t, n] of Object.entries(now)) console.log(`  ${String(n).padStart(8)}  ${t}`);
    console.log("\nRun the purge, then run this again with no flag. Same sitting, no gap.");
    return;
  }

  if (!existsSync(BASELINE))
    fail(`REFUSED: no ${BASELINE}. Capture it BEFORE the purge with --before. Without a baseline ` +
         "there is no way to prove the masters survived.");
  const base = JSON.parse(readFileSync(BASELINE, "utf8")).counts;

  const problems = [];
  console.log(`MUST BE ZERO - ${MUST_BE_ZERO.length} transaction tables the purge deletes`);
  for (const { table } of MUST_BE_ZERO) {
    const n = now[table], b = base[table];
    const bad = typeof n !== "number" || n !== 0;
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${String(n).padStart(8)}  ${table}   (was ${b})`);
    if (bad) problems.push(`${table} still holds ${n} row(s) - the purge did not finish`);
  }

  console.log("\nMUST SURVIVE - masters, banking and evidence");
  for (const [table, why] of MUST_SURVIVE) {
    const n = now[table], b = base[table];
    const bad = typeof n !== "number" || typeof b !== "number" || n < b;
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${String(n).padStart(8)}  ${table}   (was ${b})  ${why}`);
    if (bad)
      problems.push(
        `${table} fell from ${b} to ${n} - ${why.toUpperCase()}. THE PURGE TOOK SOMETHING IT WAS NEVER MEANT TO TOUCH.`,
      );
  }

  if (problems.length) {
    console.error(`\nPURGE NOT VERIFIED - ${problems.length} problem(s). DO NOT FEED.`);
    problems.forEach((p) => console.error("  " + p));
    process.exit(1);
  }

  // Open the window - here, on a real PASS, never on a partial or a skip.
  let ps = {};
  if (existsSync(PURGE_STATE)) { try { ps = JSON.parse(readFileSync(PURGE_STATE, "utf8")); } catch { ps = {}; } }
  ps.verified_at = new Date().toISOString();
  ps.verified_by = "scripts/purge/verify-purge.mjs";
  ps.tables_verified = MUST_BE_ZERO.length;
  delete ps.day1_closed_at;   // a fresh purge reopens the window; a stale close must not shut it
  writeFileSync(PURGE_STATE, JSON.stringify(ps, null, 1));
  const expires = new Date(Date.parse(ps.verified_at) + 72 * 3600 * 1000).toISOString();

  console.log(`\nPURGE VERIFIED. All ${MUST_BE_ZERO.length} transaction tables are empty. Every master, ` +
              "every banking row and every document survived.");
  console.log(`  ${PURGE_STATE} written: verified_at = ${ps.verified_at}`);
  console.log("  THE PURGE WINDOW IS OPEN. The zero-row guard arms report \"EMPTY BY PURGE\" as a");
  console.log(`  named skip until day 1 closes or ${expires} (72h).`);
  console.log("  COMMIT purge_state.json NOW - the guards read the committed file.");
  console.log("The feed may begin with day 1. One day, one proof, one gate.");
}

main().catch((e) => fail("REFUSED: " + e.message));
