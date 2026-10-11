// LEAD 443.72 item 3 (AUTH-438) — two Dreamline receipts on settlement 5789 were fed with the month misprinted on the
// printed settlement (Company_Settlement_5789.pdf, printed 2026-09-25, period 2026-08-26..09-01):
//   load 13557 invoice 99462408 diesel $840.00 — printed "2026-09-29", true 2026-08-29 (between same-store 99460605 on
//     08-27 and 99794138 on 08-31; the trip ran Elkton 08-28 -> Irving 08-31)
//   load 13550 invoice 99460605 DEF $42.38 — printed "2026-09-27", true 2026-08-27 (the diesel line of the SAME invoice
//     prints 2026-08-27)
// The fuel row, its expense document and the document's JE all carry the September date: $882.38 sits in September.
//
// Engine path only — nothing here writes a money row by hand:
//   1. executeVoidCancel('expense')     -> reversing JE + stampDocumentVoided (governed void of the DOCUMENT)
//   2. correctFuelTransactionDate       -> the SOURCE row's date moved to the proven date (fuel-transaction-date-correction
//      .service.ts: refuses while any live document / posting / bank match hangs on the row; audited before/after)
//      — steps 1+2 in ONE transaction: the row is never undocumented-and-misdated in between.
//   3. createExpenseFromFuelTransaction -> the same document engine with the same options the Settlement Creator used for
//      these rows (settlement-creator.service.ts:1298: item, account, dreamline_card_payable, creator_manual_entry)
// Rehearsal 1 found why the source is corrected and not re-created: void-and-recreate of the same receipt is refused by
// fuel_tx_source_row_hash_uk (the voided row keeps its hash) — one provider transaction is one row, forever.
// Amounts, accounts, item, load, unit, driver, vendor, card rail: unchanged. TB 0. Asserted after each document.
//
// Modes: (default) dry run — reads and checks the measured shape, writes nothing.
//        --fork-commit — runs on a throwaway fork (assertNotProduction) and commits there.
//        --apply --auth AUTH-438 — production (assertIsIntendedProduction + verify-owner-authorization).
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-11-cc2-443-72-fuel-date-reissue.mts [--fork-commit | --apply --auth AUTH-438]
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const AUTH_ID = "AUTH-438";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const ROWS = [
  { fuel: "40ea84c2-ef43-49d9-ab0f-8f52b3209e5c", expense: "1a2c2319-93a1-452a-852e-eee9abe2450c", number: "13557", load: "13557", ref: "99462408",
    type: "diesel", cents: 84000, debit: "5000", printed: "2026-09-29", trueDate: "2026-08-29",
    quote: "Company_Settlement_5789.pdf prints '2026-09-29 LOVES 10465LONESOME PINE 99462408 146.879 5.719 840.00' — printed 2026-09-25 for 2026-08-26..09-01" },
  { fuel: "89bd8842-659c-498b-84ba-af7cc9bd1383", expense: "8878481c-b17d-49d4-a94d-218c2e0e0f4a", number: "13550-4", load: "13550", ref: "99460605",
    type: "def", cents: 4238, debit: "5010", printed: "2026-09-27", trueDate: "2026-08-27",
    quote: "Company_Settlement_5789.pdf prints '2026-09-27 LOVES 10465LONESOME 99460605 Fuel-DEF-Diesel Exhaust Fluid 42.38' while the diesel line of the same invoice prints '2026-08-27 … 99460605 … 855.22'" },
] as const;

if (APPLY) {
  const i = process.argv.indexOf("--auth");
  const auth = i > 0 ? process.argv[i + 1] : "";
  if (auth !== AUTH_ID) throw new Error(`--apply requires --auth ${AUTH_ID}`);
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", AUTH_ID], { stdio: "inherit" });
}
for (const k of Object.keys(process.env)) if (/^SAMSARA_/.test(k)) throw new Error(`REFUSE: ${k} set — this runner never talks to Samsara`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: AUTH_ID });
else await assertNotProduction(db, { label: `${AUTH_ID} ${FORK ? "fork-commit" : "dry run"}` });

const q = async <T = Record<string, unknown>>(sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows as T[];
async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
    const out = await fn();
    await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
    return out;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
const tb = async () => (await q<{ d: string }>(
  `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::text AS d
     FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
    WHERE je.operating_company_id = $1::uuid AND je.status = 'posted'`, [USMCA]))[0]!.d;

// ---- measure: refuse unless every row is exactly as measured on 2026-10-11 ----
const measured = await tx(async () => {
  const out = [];
  for (const r of ROWS) {
    const row = (await q<Record<string, string | null>>(
      `SELECT ft.id::text, ft.transaction_reference AS ref, round(ft.total_cost * 100)::bigint::text AS cents, ft.fuel_type,
              ft.transaction_at::date::text AS day, ft.voided_at::text AS ft_void, l.load_number, l.id::text AS load_id,
              ft.driver_id::text, ft.unit_id::text, ft.trailer_id::text, ft.vendor_id::text, ft.fuel_card_id::text,
              ft.gallons::text, ft.price_per_gallon::text, ft.total_cost::text, ft.location_city, ft.location_state,
              e.id::text AS eid, e.expense_number, e.transaction_date::text AS e_day, e.voided_at::text AS e_void, e.journal_entry_id::text AS je,
              je.entry_date::text AS je_day, el.item_id::text AS item_id, el.expense_account_uuid::text AS account_id,
              (SELECT a.account_number FROM catalogs.accounts a WHERE a.id = el.expense_account_uuid) AS debit_acct,
              (SELECT a.account_number FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id
                WHERE p.journal_entry_uuid = e.journal_entry_id AND p.debit_or_credit = 'credit' LIMIT 1) AS credit_acct
         FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
         JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
         JOIN accounting.expense_lines el ON el.expense_id = e.id
        WHERE ft.operating_company_id = $1::uuid AND ft.id = $2::uuid`, [USMCA, r.fuel]))[0];
    const why = !row ? "not found"
      : row.eid !== r.expense ? `expense ${row.eid}` : row.expense_number !== r.number ? `number ${row.expense_number}`
      : row.ref !== r.ref ? `ref ${row.ref}` : Number(row.cents) !== r.cents ? `cents ${row.cents}` : row.fuel_type !== r.type ? `type ${row.fuel_type}`
      : row.load_number !== r.load ? `load ${row.load_number}` : row.debit_acct !== r.debit ? `debit ${row.debit_acct}` : row.credit_acct !== "2510" ? `credit ${row.credit_acct}`
      : row.ft_void || row.e_void ? "already voided"
      : row.day !== r.printed || row.e_day !== r.printed || row.je_day !== r.printed ? `dates ${row.day}/${row.e_day}/${row.je_day} (already corrected?)`
      : "";
    if (why) throw new Error(`REFUSE ${r.number}: not as measured — ${why}`);
    out.push({ r, row: row! });
    console.log(`measured ${r.number} (${r.load} ${r.ref} ${r.type} $${(r.cents / 100).toFixed(2)}): fuel/expense/JE ${r.printed}, Dr ${r.debit} / Cr 2510 — to ${r.trueDate}`);
  }
  return out;
});
if (!APPLY && !FORK) {
  console.log("DRY RUN — nothing written. --fork-commit on a fork, then --apply --auth AUTH-438.");
  await db.end();
  process.exit(0);
}

const tbBefore = await tb();
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.ts");
const { correctFuelTransactionDate } = await import("../../apps/backend/src/fuel/fuel-transaction-date-correction.service.ts");
const { createExpenseFromFuelTransaction } = await import("../../apps/backend/src/fuel/fuel-expense-document.service.ts");
const { postSourceTransactionInClientTx } = await import("../../apps/backend/src/accounting/posting-engine.service.ts");
const { stampExpensePosted } = await import("../../apps/backend/src/driver-finance/settlement-creator.service.ts");

const results = [];
for (const { r, row } of measured) {
  const reason = `${AUTH_ID} (Lead 443.72 item 3): receipt dated with the month misprinted on the printed settlement — true date ${r.trueDate}`;
  await tx(async () => {
    const ve = await executeVoidCancel("expense", { client: db, operatingCompanyId: USMCA, entityId: r.expense, action: "void", userId: OWNER, reason: `${reason}. ${r.quote}` } as never);
    if ((ve as { kind: string }).kind !== "ok") throw new Error(`expense void ${r.number}: ${JSON.stringify(ve)}`);
    const fixed = await correctFuelTransactionDate(db as never, {
      operatingCompanyId: USMCA, fuelTransactionId: r.fuel, trueDate: r.trueDate, reason, evidence: r.quote, actorUserId: OWNER,
    });
    if (fixed.outcome !== "corrected") throw new Error(`date correction ${r.number}: ${JSON.stringify(fixed)}`);
  });
  // Step 3 is the Creator's own sequence (settlement-creator.service.ts:1298-1415): document -> post -> stamp, one transaction.
  await tx(async () => {
    const doc = await createExpenseFromFuelTransaction(db as never, {
      operating_company_id: USMCA, fuel_transaction_id: r.fuel, requesting_user_uuid: OWNER,
      item_id: row.item_id, account_id: row.account_id, company_direct_credit: "dreamline_card_payable", creator_manual_entry: true,
    } as never) as { outcome: string; expense_id?: string };
    if (doc.outcome !== "created" || !doc.expense_id) throw new Error(`STOP ${r.number}: document ${JSON.stringify(doc)} — the old document is void and the row is re-dated; re-run step 3 only`);
    const posted = await postSourceTransactionInClientTx(db as never,
      { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: doc.expense_id }, { userId: OWNER });
    if (!posted.journal_entry_id) throw new Error(`STOP ${r.number}: posting engine returned no journal entry`);
    await stampExpensePosted(db as never, USMCA, doc.expense_id, posted.journal_entry_id);
  });
  const after = (await q<Record<string, string | null>>(
    `SELECT e.expense_number, e.transaction_date::text AS e_day, je.entry_date::text AS je_day, ft.transaction_at::date::text AS day,
            e.load_id::text, e.unit_id::text, e.driver_uuid::text,
            (SELECT string_agg(a.account_number || ':' || p.debit_or_credit || ':' || p.amount_cents, ',' ORDER BY p.debit_or_credit DESC)
               FROM accounting.journal_entry_postings p JOIN catalogs.accounts a ON a.id = p.account_id WHERE p.journal_entry_uuid = e.journal_entry_id) AS legs,
            (SELECT el.item_id::text FROM accounting.expense_lines el WHERE el.expense_id = e.id LIMIT 1) AS item_id,
            (SELECT count(*)::int FROM accounting.expenses x WHERE x.source_fuel_transaction_id = ft.id AND x.voided_at IS NULL) AS live_docs
       FROM fuel.fuel_transactions ft JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL
       JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
      WHERE ft.id = $1::uuid`, [r.fuel]))[0];
  const want = `${r.debit}:debit:${r.cents},2510:credit:${r.cents}`;
  const bad = !after ? "no document" : after.day !== r.trueDate || after.e_day !== r.trueDate || after.je_day !== r.trueDate ? `dates ${after.day}/${after.e_day}/${after.je_day}`
    : after.legs !== want ? `legs ${after.legs} (want ${want})` : after.load_id !== row.load_id || after.unit_id !== row.unit_id || after.driver_uuid !== row.driver_id
    ? "load/unit/driver changed" : after.item_id !== row.item_id ? `item ${after.item_id}` : Number(after.live_docs) !== 1 ? `${after.live_docs} live documents` : "";
  if (bad) throw new Error(`STOP ${r.number}: reissue not as designed — ${bad}`);
  console.log(`reissued ${r.number} -> ${after!.expense_number}: fuel row + document + JE all ${r.trueDate}; ${after!.legs}`);
  results.push({ from: r.number, to: after!.expense_number, fuel: r.fuel, date: r.trueDate });
}
const tbAfter = await tb();
console.log(`TB (sum Dr - Cr, posted) before ${tbBefore} after ${tbAfter}`);
if (tbAfter !== "0") throw new Error(`STOP: TB ${tbAfter}`);
console.log(JSON.stringify({ auth: AUTH_ID, mode: APPLY ? "apply" : "fork-commit", results }));
await db.end();
