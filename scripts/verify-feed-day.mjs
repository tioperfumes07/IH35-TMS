#!/usr/bin/env node
/**
 * GUARD — verify-feed-day (R-162 Guard A, brought into the repo from
 * ~/Downloads/IH35-RECONCILIATION-AND-FEED/02-CONTROLS-AND-GATES/verify-feed-day.mjs)
 *
 * WHAT THIS PROTECTS
 * The re-feed runs one Faro purchase day at a time, 23 days, 8/10/26 -> 9/21/26. A day that
 * does not tie to Faro's own export must STOP the feed. Feeding day N+1 on top of an untied
 * day N is exactly how the last population drifted: each day looked close, nobody closed one,
 * and the error compounded 23 times.
 *
 * FIVE COLUMNS, ALL FIVE, EVERY DAY (plus invoice count and the invoice-number set). Count is a
 * column: a day with the right dollars and the wrong number of invoices is NOT tied.
 *
 * CONTROL: scripts/day_control.json (copied verbatim from the source above, built by
 * build_day_control.py straight from 01-FARO/PURCHASE REPORT ALL.csv + funds due report
 * 09-21-26.csv). No number in it is hand-typed.
 *
 * LIVE QUERY (R-162 Guard A, wired in): measured values come from
 * accounting.factoring_advances, keyed on faro_invoice_number matched against that day's own
 * control.inv[] list (never by date -- a purchase date can differ from the Faro invoice's own
 * batch date):
 *   - purchase  = SUM(invoice_total_cents) / 100
 *   - escrow    = SUM(reserve_amount_cents) / 100
 *   - discount  = SUM(factor_fee_cents) / 100
 *   - net_adv   = SUM(advance_amount_cents) / 100
 *   - invoices  = COUNT(*) (voided rows excluded)
 *   - inv[]     = the matched faro_invoice_number set
 * wire has NO column on accounting.factoring_advances (R-162's own finding) -- it is read from
 * the funding JE's own 6300 leg, joined by source_transaction_type='factoring_advance' AND
 * source_transaction_id = the advance's id (confirmed live: this is how the writer already posts
 * a wire-fee leg on SOME advances' own funding JE, not a separate JE) -- SUM of live (posted,
 * not part of a reversed_by_je_id/reverses_je_id pair, same rule as R-153.9's costs guard)
 * debit-minus-credit amount_cents on 6300 for those source_transaction_ids, / 100.
 *
 * USAGE
 *   node verify-feed-day.mjs --day 8/10/26            live, needs DATABASE_URL
 *   node verify-feed-day.mjs --day 8/10/26 --measured '<json>'   compare a supplied measurement
 *   node verify-feed-day.mjs --all                    live, all 23 days, prints the table
 *   node verify-feed-day.mjs --selftest               no DB, proves the comparator fails
 *
 * FAIL-CLOSED: no DATABASE_URL and no --measured in live mode = exit 1, never skip.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const LABEL = "verify-feed-day";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTROL_FILE = path.join(ROOT, "scripts/day_control.json");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const TOL = 0.005; // half a cent
const COLUMNS = ["invoices", "purchase", "escrow", "discount", "wire", "net_adv"];

function loadControl(day) {
  const c = JSON.parse(readFileSync(CONTROL_FILE, "utf8"));
  const d = c.days.find((x) => x.date === day);
  if (!d) {
    throw new Error(
      `${LABEL}: ${day} is not one of the 23 Faro purchase days. Valid: ${c.days.map((x) => x.date).join(", ")}`,
    );
  }
  return d;
}

function loadAllDays() {
  const c = JSON.parse(readFileSync(CONTROL_FILE, "utf8"));
  return c.days;
}

/** Pure comparator. Returns [] when the day ties. Unchanged from the source file. */
export function compareDay(control, measured) {
  const errors = [];
  for (const col of COLUMNS) {
    const want = Number(control[col] ?? 0);
    const got = Number(measured[col] ?? 0);
    if (Math.abs(want - got) >= TOL) {
      errors.push(
        `${col}: Faro says ${want.toLocaleString("en-US", { minimumFractionDigits: col === "invoices" ? 0 : 2 })}, ` +
          `we fed ${got.toLocaleString("en-US", { minimumFractionDigits: col === "invoices" ? 0 : 2 })} ` +
          `(delta ${(got - want).toFixed(2)})`,
      );
    }
  }
  // Every Faro invoice on this day must exist in what we fed, by invoice number.
  const want = new Set((control.inv ?? []).map(String));
  const got = new Set((measured.inv ?? []).map(String));
  const missing = [...want].filter((i) => !got.has(i));
  const extra = [...got].filter((i) => !want.has(i));
  if (missing.length) errors.push(`invoices Faro purchased that we did NOT feed: ${missing.join(", ")}`);
  if (extra.length) errors.push(`invoices we fed that Faro did NOT purchase: ${extra.join(", ")}`);
  return errors;
}

/**
 * Live measurement for one day, R-162 Guard A's own wiring.
 * @param {import("pg").PoolClient} client
 * @param {{date: string, inv: string[]}} control
 */
async function measureDayLive(client, control) {
  const invNumbers = (control.inv ?? []).map(String);
  if (invNumbers.length === 0) {
    return { invoices: 0, purchase: 0, escrow: 0, discount: 0, wire: 0, net_adv: 0, inv: [] };
  }

  const advRes = await client.query(
    `SELECT id::text, faro_invoice_number, invoice_total_cents, reserve_amount_cents,
            factor_fee_cents, advance_amount_cents
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1
        AND faro_invoice_number = ANY($2::text[])
        AND voided_at IS NULL`,
    [USMCA_COMPANY_ID, invNumbers],
  );

  const advanceIds = advRes.rows.map((r) => r.id);
  let wireCents = 0;
  if (advanceIds.length > 0) {
    const wireRes = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS wire_cents
         FROM accounting.journal_entry_postings jep
         JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE a.account_number = '6300'
          AND je.operating_company_id = $1
          AND je.status = 'posted'
          AND je.reversed_by_je_id IS NULL
          AND je.reverses_je_id IS NULL
          AND jep.source_transaction_type = 'factoring_advance'
          AND jep.source_transaction_id = ANY($2::text[])`,
      [USMCA_COMPANY_ID, advanceIds],
    );
    wireCents = Number(wireRes.rows[0]?.wire_cents ?? 0);
  }

  const sumCents = (col) => advRes.rows.reduce((s, r) => s + Number(r[col] ?? 0), 0);
  return {
    invoices: advRes.rows.length,
    purchase: sumCents("invoice_total_cents") / 100,
    escrow: sumCents("reserve_amount_cents") / 100,
    discount: sumCents("factor_fee_cents") / 100,
    wire: wireCents / 100,
    net_adv: sumCents("advance_amount_cents") / 100,
    inv: advRes.rows.map((r) => r.faro_invoice_number),
  };
}

function selftest() {
  const control = loadControl("8/10/26");
  const perfect = {
    invoices: control.invoices, purchase: control.purchase, escrow: control.escrow,
    discount: control.discount, wire: control.wire, net_adv: control.net_adv, inv: control.inv,
  };
  const base = compareDay(control, perfect);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — a perfect day did not tie:`);
    for (const e of base) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["one cent short on purchase", (m) => ({ ...m, purchase: m.purchase - 0.01 })],
    ["one cent over on net advance", (m) => ({ ...m, net_adv: m.net_adv + 0.01 })],
    ["escrow missed entirely", (m) => ({ ...m, escrow: 0 })],
    ["discount missed entirely", (m) => ({ ...m, discount: 0 })],
    ["wire fee dropped", (m) => ({ ...m, wire: 0 })],
    ["right dollars, one invoice too few", (m) => ({ ...m, invoices: m.invoices - 1, inv: m.inv.slice(1) })],
    ["right count, wrong invoice number", (m) => ({ ...m, inv: [...m.inv.slice(1), "9999"] })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate({ ...perfect, inv: [...perfect.inv] });
    if (JSON.stringify(broken) === JSON.stringify(perfect)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (compareDay(control, broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — a perfect 8/10/26 ties and ${mutations.length} mutations all trip the gate.`);
  process.exit(0);
}

function fmt(n, isCount) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: isCount ? 0 : 2 });
}

async function runAllDays() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const days = loadAllDays();
  const rows = [];
  let anyFail = false;
  for (const control of days) {
    const measured = await measureDayLive(client, control);
    const errors = compareDay(control, measured);
    if (errors.length) anyFail = true;
    rows.push({ date: control.date, measured, errors });
  }
  await client.query("ROLLBACK");
  await client.end();

  console.log(
    `${"date".padEnd(8)} ${"inv".padStart(4)} ${"purchase".padStart(12)} ${"escrow".padStart(10)} ${"discount".padStart(10)} ${"wire".padStart(10)} ${"net_adv".padStart(12)}  status`,
  );
  for (const { date, measured, errors } of rows) {
    console.log(
      `${date.padEnd(8)} ${fmt(measured.invoices, true).padStart(4)} ${fmt(measured.purchase).padStart(12)} ${fmt(measured.escrow).padStart(10)} ${fmt(measured.discount).padStart(10)} ${fmt(measured.wire).padStart(10)} ${fmt(measured.net_adv).padStart(12)}  ${errors.length ? "FAIL" : "PASS"}`,
    );
    for (const e of errors) console.log(`    - ${e}`);
  }
  console.log("");
  if (anyFail) {
    console.error(`${LABEL} --all FAIL — one or more days do not tie (see above). Report the cause to CC-1, who owns the books.`);
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --all PASS — all ${days.length} days tie on all five columns and every invoice number.`);
  }
}

async function run() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }

  if (argv.includes("--all")) {
    if (!process.env.DATABASE_URL) {
      console.error(`${LABEL} FAIL — no DATABASE_URL. This guard never skips.`);
      process.exit(1);
    }
    await runAllDays();
    return;
  }

  const day = argv[argv.indexOf("--day") + 1];
  if (!argv.includes("--day") || !day) {
    console.error(`${LABEL} FAIL — --day is required (e.g. --day 8/10/26), or use --all.`);
    process.exit(1);
  }
  let control;
  try {
    control = loadControl(day);
  } catch (e) {
    console.error(`${LABEL} FAIL — ${e.message}`);
    process.exit(1);
  }

  let measured = null;
  if (argv.includes("--measured")) {
    measured = JSON.parse(argv[argv.indexOf("--measured") + 1]);
  } else if (!process.env.DATABASE_URL) {
    console.error(`${LABEL} FAIL — no DATABASE_URL and no --measured. This guard never skips.`);
    process.exit(1);
  } else {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    measured = await measureDayLive(client, control);
    await client.query("ROLLBACK");
    await client.end();
  }

  const errors = compareDay(control, measured);
  console.log(
    `${LABEL} ${day} — Faro: ${control.invoices} invoices, $${control.purchase.toLocaleString("en-US", { minimumFractionDigits: 2 })} purchased, $${control.net_adv.toLocaleString("en-US", { minimumFractionDigits: 2 })} advanced`,
  );
  if (errors.length) {
    console.error(`${LABEL} FAIL — day ${day} does NOT tie. THE FEED STOPS HERE. Do not feed the next day.`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — day ${day} ties on all five columns and every invoice number.`);
}

await run();
