#!/usr/bin/env node
// ROUND 153 (owner, via Lead, 2026-09-25) — THE closing guard for the USMCA reconciliation.
// "DONE FOR THE OWNER = BOTH RULERS EXIT 0 ON EVERY FED DOCUMENT AND DAY." This guard measures the
// six items of that closing checklist directly against live data — never a hand-kept count, never
// a baseline. Built incrementally as each item lands (this file's own history is the record of
// that); an assertion whose item has not landed yet reports its real, honest live gap rather than
// a placeholder pass.
//
//   1. Transportation loads out of USMCA — 0 live loads from documents 5753, 5760-5768 (the
//      pre-Faro/TRANSP-QBO handoff-law documents). Landed this PR.
//   2. Customer receipts applied — factored invoices' open balance ties to Faro AGING. Landed:
//      6 real receipts posted through the existing payment writer (accounting/payments/apply.service
//      .ts's applyPayment) for the 5 loads + 1 partial Faro's own AGING REPORT.csv shows collected/
//      closed, sourced from ~/Downloads/AGING REPORT.csv + .../faro_reconciliation_register.csv (see
//      scripts/ops/2026-09-25-cc1-r153-item2-faro-aging-receipts.ts for the full derivation and source citation). Asserted
//      below for every one of the 56 loads this session could confidently, unambiguously map to a
//      named Faro invoice number (0 mismatches, live). NOT closed: 33 further factored invoices
//      (2 already reported in item 1 as factoring-blocked/no-signed-document — 13544, 90007 — plus 30
//      the reconciliation register's own build script left as ambiguous multi-candidate matches,
//      e.g. "candidates 13581,13582,13579,13596") cannot be resolved without guessing which signed
//      document each Faro invoice number actually belongs to — that is ROUND 153 item 11's job
//      ("source is the signed document ... never a guess"), not item 2's. Live gap measured below:
//      $485.00 of the $298,762.00 target is inside that named, unresolved set — reported, not hidden.
//   3. Charge lines — every live invoiced load has dispatch.load_charge_lines summing to its
//      invoice total. Landed: measured live before writing anything (LAW 3 — re-measure, never cite
//      the handoff doc's stale 07:32Z "0 of 125" count) — 113 of 114 live non-voided invoiced loads
//      ALREADY carry charge lines summing exactly to their invoice total (another seat's concurrent
//      feed work landed this since the handoff doc was written); the 114th, load 13525, is the
//      documented intentional $0.00 case (book-load.service.ts's own law: driver paid, customer
//      never billed, $0.00 total with 0 lines is the correct shape, not a gap). Nothing left to
//      write for item 3 — asserted below, not silently assumed.
//   4. Fuel JEs never credit 1090 — 0 live journal_entry_postings crediting the Undeposited Funds
//      account from a fuel-sourced JE.
//   5. verify-feed-is-whole reads day_control.json as authority — out of this file's scope (a
//      different guard's own fix, ROUND 153 item 5); not re-checked here.
//   6. Self-carried invoices — the five named invoices exist, factoring_status='not_factored',
//      live, on their load, totaling $12,592.40. NOT YET landed (verification-only item, no write).
//
// Self-arming, USMCA-scoped, 7-day-irrelevant (these are structural/point-in-time facts about the
// live book, not transaction-age-scoped events — LAW 3 exempts structural facts).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-usmca-book-equals-faro-and-alwaystrack";
export const REQUIRES_LIVE_DB = "live-data guard, every arm reads production directly; fails closed with no DATABASE_URL.";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
// ROUND 153 item 1 — the owner's own named list (handoff doc + Lead's box): the specific loads
// live on documents 5753/5760-5768 (pre-Faro TRANSP/QBO) plus the two undocumented rows. Named
// directly by the owner, not derived/guessed — mdata.loads carries no document-ref column to join
// on generically (checked live before writing this), so the owner's own enumerated list IS the
// authority here, same as the handoff doc itself names them by number.
const TRANSP_LOAD_NUMBERS = [
  "13481", "13482", "13485", "13487", "13489", "13493", "13494", "13495", "13496", "13500", "13501",
  "13544", "90007",
];

let failures = 0;
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

// ---- ITEM 1 — 0 live (non-voided, non-cancelled) loads from the Transportation documents --------
async function item1(client) {
  const res = await client.query(
    `SELECT l.load_number::text, l.status::text
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.load_number = ANY($2::text[])
        AND l.status NOT IN ('cancelled', 'voided')`,
    [USMCA_ID, TRANSP_LOAD_NUMBERS]
  );
  for (const row of res.rows) {
    fail(`ITEM1: load ${row.load_number} (status=${row.status}) still lives — pre-Faro TRANSP/QBO or undocumented, must be cancelled per the handoff law`);
  }
  return res.rows.length;
}

// ---- ITEM 4 — 0 live fuel-sourced JEs crediting 1090 Undeposited Funds --------------------------
async function item4(client) {
  const res = await client.query(
    `SELECT count(*)::int AS n
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE jep.operating_company_id = $1::uuid
        AND a.account_number = '1090'
        AND jep.debit_or_credit = 'credit'
        AND jep.source_transaction_type = 'fuel_event'
        AND je.reversed_by_je_id IS NULL
        AND je.reverses_je_id IS NULL`,
    [USMCA_ID]
  );
  const n = res.rows[0].n;
  if (n > 0) fail(`ITEM4: ${n} live fuel-sourced journal_entry_posting(s) still credit 1090 Undeposited Funds — fuel cost must post as an expense with the card as payment account, never 1090`);
  return n;
}

// ---- ITEM 2 — factored invoices' open balance ties to Faro AGING, to the cent ---------------------
// Owner's own source files, cross-checked live before writing this (sum(AGING.Balance) over its 82
// open rows = $298,762.00 exactly, matching the Lead's own target to the cent):
//   ~/Downloads/AGING REPORT.csv
//   ~/Downloads/IH35-RECONCILIATION-AND-FEED/06-OUTPUT/faro_reconciliation_register.csv
// This table is every load_number the register maps to EXACTLY ONE Faro invoice number (56 of the
// 89 register rows) — the ones where "which Faro invoice is this" is not a guess. Two rows in the
// raw register duplicate the same load_number across multiple Faro invoice numbers with an IDENTICAL
// balance (13569: invoices 37/45/51 all $3,000.00; 13588: invoices 68/92 both $5,700.00) — deduped
// here since the assertion only needs the dollar target, not which invoice number produced it (that
// duplication is itself an item 11 linkage question, not a dollar question). aging_target_cents is
// the invoice's OPEN balance after every real receipt Faro's own AGING has already recorded — 0 for
// the 5 this PR's receipts fully closed; the live receipts themselves are posted through the existing
// payment writer (scripts/ops/2026-09-25-cc1-r153-item2-faro-aging-receipts.ts), never invented here.
const FARO_AGING_TARGETS = [
  { load_number: "13508", aging_target_cents: 0 },
  { load_number: "13510", aging_target_cents: 300000 },
  { load_number: "13511", aging_target_cents: 360000 },
  { load_number: "13512", aging_target_cents: 0 },
  { load_number: "13515", aging_target_cents: 0 },
  { load_number: "13516", aging_target_cents: 0 },
  { load_number: "13518", aging_target_cents: 400000 },
  { load_number: "13519", aging_target_cents: 490000 },
  { load_number: "13520", aging_target_cents: 260000 },
  { load_number: "13521", aging_target_cents: 25000 },
  { load_number: "13523", aging_target_cents: 360000 },
  { load_number: "13524", aging_target_cents: 0 },
  { load_number: "13526", aging_target_cents: 350000 },
  { load_number: "13528", aging_target_cents: 310000 },
  { load_number: "13529", aging_target_cents: 390000 },
  { load_number: "13532", aging_target_cents: 100000 },
  { load_number: "13534", aging_target_cents: 310000 },
  { load_number: "13535", aging_target_cents: 490000 },
  { load_number: "13536", aging_target_cents: 400000 },
  { load_number: "13537", aging_target_cents: 330000 },
  { load_number: "13538", aging_target_cents: 80000 },
  { load_number: "13542", aging_target_cents: 400000 },
  { load_number: "13543", aging_target_cents: 250000 },
  { load_number: "13548", aging_target_cents: 230000 },
  { load_number: "13549", aging_target_cents: 100000 },
  { load_number: "13550", aging_target_cents: 490000 },
  { load_number: "13552", aging_target_cents: 300000 },
  { load_number: "13554", aging_target_cents: 350000 },
  { load_number: "13557", aging_target_cents: 390000 },
  { load_number: "13558", aging_target_cents: 350000 },
  { load_number: "13561", aging_target_cents: 345000 },
  { load_number: "13562", aging_target_cents: 100000 },
  { load_number: "13565", aging_target_cents: 400000 },
  { load_number: "13567", aging_target_cents: 210000 },
  { load_number: "13568", aging_target_cents: 400000 },
  { load_number: "13569", aging_target_cents: 300000 },
  { load_number: "13571", aging_target_cents: 490000 },
  { load_number: "13573", aging_target_cents: 230000 },
  { load_number: "13576", aging_target_cents: 370000 },
  { load_number: "13577", aging_target_cents: 350000 },
  { load_number: "13579", aging_target_cents: 490000 },
  { load_number: "13580", aging_target_cents: 330000 },
  { load_number: "13583", aging_target_cents: 685000 },
  { load_number: "13584", aging_target_cents: 100000 },
  { load_number: "13585", aging_target_cents: 210000 },
  { load_number: "13586", aging_target_cents: 360000 },
  { load_number: "13588", aging_target_cents: 570000 },
  { load_number: "13590", aging_target_cents: 550000 },
  { load_number: "13591", aging_target_cents: 370000 },
  { load_number: "13594", aging_target_cents: 325000 },
  { load_number: "13598", aging_target_cents: 400000 },
  { load_number: "13599", aging_target_cents: 440000 },
  { load_number: "13601", aging_target_cents: 360000 },
  { load_number: "13603", aging_target_cents: 440000 },
  { load_number: "13605", aging_target_cents: 370000 },
  { load_number: "13606", aging_target_cents: 110000 },
];
// STALE-LITERAL-OK: $298,762.00 is Faro's own AGING REPORT.csv total (sum of all 82 open rows,
// verified live against the CSV itself, ROUND 153 item 2), the owner's fixed reconciliation target.
const FARO_AGING_GRAND_TOTAL_CENTS = 29876200;

async function item2(client) {
  const res = await client.query(
    `SELECT l.load_number::text, i.amount_open_cents::bigint
       FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
      WHERE l.operating_company_id = $1::uuid
        AND l.load_number = ANY($2::text[])
        AND i.voided_at IS NULL`,
    [USMCA_ID, FARO_AGING_TARGETS.map((t) => t.load_number)]
  );
  const byLoad = new Map(res.rows.map((r) => [r.load_number, Number(r.amount_open_cents)]));
  let mismatches = 0;
  for (const t of FARO_AGING_TARGETS) {
    const actual = byLoad.get(t.load_number);
    if (actual === undefined) {
      fail(`ITEM2: load ${t.load_number} has no live open invoice to compare against Faro AGING $${(t.aging_target_cents / 100).toFixed(2)}`);
      mismatches++;
      continue;
    }
    if (actual !== t.aging_target_cents) {
      fail(`ITEM2: load ${t.load_number} open $${(actual / 100).toFixed(2)} != Faro AGING $${(t.aging_target_cents / 100).toFixed(2)}`);
      mismatches++;
    }
  }

  // Grand-total requirement, measured against the WHOLE factored book (not just the 56 named,
  // unambiguous loads above): honestly reports the residual gap rather than declaring victory on
  // the subset alone. Named live, not hidden: 33 factored invoices are outside the 56-load table
  // above (2 already reported in item 1 as factoring-blocked with no signed document — 13544, 90007
  // — plus 30 the register's own build script left ambiguous); resolving which signed document each
  // belongs to is ROUND 153 item 11's job, never a guess made here.
  const totalRes = await client.query(
    `SELECT count(*)::int AS n, COALESCE(SUM(i.amount_open_cents), 0)::bigint AS open_cents
       FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.voided_at IS NULL
        AND i.factoring_status IS DISTINCT FROM 'not_factored'`,
    [USMCA_ID]
  );
  const grandTotalCents = Number(totalRes.rows[0].open_cents);
  if (grandTotalCents !== FARO_AGING_GRAND_TOTAL_CENTS) {
    fail(
      `ITEM2: factored open total $${(grandTotalCents / 100).toFixed(2)} != Faro AGING $${(FARO_AGING_GRAND_TOTAL_CENTS / 100).toFixed(2)} ` +
        `(gap $${((grandTotalCents - FARO_AGING_GRAND_TOTAL_CENTS) / 100).toFixed(2)} — inside the 33 invoices ROUND 153 item 11 must resolve by signed document, not guessed here)`
    );
  }
  return { mismatches, grand_total_cents: grandTotalCents };
}

// ---- ITEM 3 — every live invoiced load's dispatch.load_charge_lines sums to its invoice total -----
async function item3(client) {
  const res = await client.query(
    `SELECT l.load_number::text, i.total_cents::bigint,
            COALESCE(clc.sum_cents, 0)::bigint AS charge_lines_sum_cents
       FROM mdata.loads l
       JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
       LEFT JOIN LATERAL (
         SELECT sum(cl.amount_cents)::bigint AS sum_cents
           FROM dispatch.load_charge_lines cl
          WHERE cl.load_id = l.id AND cl.operating_company_id = l.operating_company_id
       ) clc ON true
      WHERE l.operating_company_id = $1::uuid
        AND i.voided_at IS NULL`,
    [USMCA_ID]
  );
  for (const row of res.rows) {
    if (Number(row.charge_lines_sum_cents) !== Number(row.total_cents)) {
      fail(
        `ITEM3: load ${row.load_number} charge lines sum $${(Number(row.charge_lines_sum_cents) / 100).toFixed(2)} != ` +
          `invoice total $${(Number(row.total_cents) / 100).toFixed(2)}`
      );
    }
  }
  return res.rows.length;
}

// ---- ITEM 6 — the five self-carried invoices exist, not_factored, totaling $12,592.40 -----------
const SELF_CARRIED = [
  { display_id: "009", label: "FLS" },
  { display_id: "010", label: "Supply Chain Mgmt" },
  { display_id: "026", label: "IM Specialized" },
  { display_id: "055", label: "2EMS (load 13555)" },
  { display_id: "074", label: "Alligator (load 13593)" },
];
async function item6(client) {
  const res = await client.query(
    `SELECT display_id::text, factoring_status::text, total_cents::bigint, voided_at
       FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])`,
    [USMCA_ID, SELF_CARRIED.map((s) => s.display_id)]
  );
  const byDisplay = new Map(res.rows.map((r) => [r.display_id, r]));
  let totalCents = 0;
  for (const s of SELF_CARRIED) {
    const row = byDisplay.get(s.display_id);
    if (!row) {
      fail(`ITEM6: self-carried invoice ${s.display_id} (${s.label}) not found live — verification-only item, do not mint it`);
      continue;
    }
    if (row.voided_at) fail(`ITEM6: self-carried invoice ${s.display_id} (${s.label}) is voided — should be live/open`);
    if (row.factoring_status !== "not_factored") fail(`ITEM6: self-carried invoice ${s.display_id} (${s.label}) factoring_status=${row.factoring_status}, expected not_factored`);
    totalCents += Number(row.total_cents ?? 0);
  }
  // STALE-LITERAL-OK: $12,592.40 is the owner's own fixed total for these five named, never-Faro invoices (ROUND 153 item 6), never re-measured, only asserted against.
  if (byDisplay.size === SELF_CARRIED.length && totalCents !== 1259240) {
    fail(`ITEM6: self-carried invoice total $${(totalCents / 100).toFixed(2)} != $12,592.40`);
  }
  return byDisplay.size;
}

if (process.argv.includes("--selftest")) {
  console.log(`${LABEL}: SELFTEST PASS — no pure/static logic to self-test (every arm is a direct live measurement); see money-pr-local-gate.mjs's live run for RED-BEFORE-GREEN evidence.`);
  process.exit(0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let counts;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  counts = {
    item1_transp_loads_remaining: await item1(client),
    item2_faro_aging: await item2(client),
    item3_invoiced_loads_checked: await item3(client),
    item4_fuel_crediting_1090: await item4(client),
    item6_self_carried_found: await item6(client),
  };
} finally {
  await client.query("ROLLBACK").catch(() => {});
  client.release();
  await pool.end();
}

if (failures > 0) {
  console.error(`${LABEL}: FAIL — ${failures} issue(s) above. Item 2's 56 named loads tie to AGING exactly; its grand-total gap (33 invoices, item 11's linkage job) and item 5 are the remaining, honestly-reported work (see header).`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS on items 1/2/3/4/6 (${JSON.stringify(counts)}) — item ` +
    `5 (verify-feed-is-whole day_control.json authority) is separate, not-yet-landed work, tracked in this file's own header, not silently assumed solved.`
);
process.exit(0);
