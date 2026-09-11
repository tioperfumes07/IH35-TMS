#!/usr/bin/env node
/**
 * REG-028/030 (USMCA FREIGHT, Bank of America checking, mask 3224,
 * bank_account_id e83028a5-dcda-4233-b660-5b9923b3d39c) -- ground-truth reconciliation against the
 * real BofA CSV export (288 transactions, 03/10/2025 - 09/09/2026), cross-verified against 2 official
 * PDF eStatements (per owner packet 2026-09-11). The statement's OWN PRINTED ending-balance line
 * reads: 09/09/2026, "Wire Transfer Fee", -15.00, Running Bal. "6,389.72" -- i.e. $6,389.72
 * (638972 cents). Owner Law #9: the signed doc / live table / bank statement is the source, never a
 * derived query alone -- this guard checks against that printed line, not a recomputed one.
 *
 * TWO INDEPENDENT FIXES CONVERGED ON THIS ACCOUNT (both true, not contradictory):
 * (1) This guard's own author (CC-2) independently re-derived, matching CSV rows to Neon rows by
 *     (transaction_date, is_credit ? +abs(amount_cents) : -abs(amount_cents)) -- i.e. using the
 *     is_credit flag exactly as Plaid originally stored it, no sign change -- and got 286/288 exact
 *     matches (vs only 6/288 using raw amount_cents with no is_credit correction). This proved
 *     is_credit was always correct and a correct reconciliation NEVER REQUIRED changing amount_cents'
 *     stored sign -- consistent with Plaid's documented native convention (positive=OUT,
 *     negative=IN) established repeatedly this session (BANK-F10005 2026-09-04, BANK-F10041
 *     2026-09-07, BANK-F30002 2026-09-08).
 * (2) SEPARATELY, PR #21744 (Cursor, merged 2026-09-11 as a second, independently-authored fix
 *     reusing the SAME finding id "BANK-F10005" for a different claim -- a finding-registry
 *     collision worth its own note) took the opposite design choice: it redefined
 *     banking.bank_transactions.amount_cents' storage convention GOING FORWARD, for every account
 *     and every entity, to money-in-positive ("statement-signed") via a new
 *     plaidAmountToStatementCents() helper in plaid.service.ts, and retroactively re-signed this
 *     ONE account's 286 non-phantom rows to match (confirmed live: raw sum now equals the
 *     is_credit-based sum, both 638972 -- the 12/08 deposit that used to read
 *     amount_cents=-10000/is_credit=true now reads amount_cents=+10000/is_credit=true). Both
 *     conventions are internally consistent and BOTH reconcile to the same $6,389.72 -- the
 *     disagreement was purely "what should the column's stored sign mean", not a factual dispute
 *     about the data or about is_credit (both fixes agree is_credit was always correct).
 *
 * BLAST-RADIUS NOTE (filed to OUTBOX/GUARD-WORKORDERS as its own owner-attention item, not
 * re-litigated here): PR #21744's convention flip applies to the Plaid ingest path for EVERY
 * account/entity going forward, but its repair script only re-signed this ONE account's historical
 * rows. Every other pre-existing Plaid-sourced row system-wide (~9,839 at last count, other USMCA
 * accounts + TRANSP + TRK) is still on the OLD (native Plaid) sign convention and has no plan to be
 * revisited. Every consumer this session actually checked (posting-engine.service.ts's
 * buildBankCategorizationLines, BankingTransactionsDesignView.tsx's spentReceived,
 * bank-tx-dedup.ts's dedup hash, bank-recon/match.service.ts's candidate matching) already derives
 * direction from is_credit alone and magnitude from Math.abs(amount_cents) alone -- both
 * convention-agnostic by construction -- so this guard (and, as far as this session could verify,
 * the live app) is NOT broken by the resulting cross-row inconsistency. But any FUTURE code that
 * reads amount_cents' raw sign directly, without going through is_credit, will get a different
 * answer depending on which account/era a row is from -- a real, durable landmine this note exists
 * to flag, not fix (fixing it means either reverting the going-forward convention change or
 * backfilling ~9,839 more rows across every entity, both real decisions for the owner, not a
 * unilateral call from either fix).
 *
 * FIX THIS GUARD LOCKS (live Neon, first observed 2026-09-11T01:06:09Z): the 36 phantom rows were
 * voided (void-not-delete; voided_reason='reg030_bofa_statement_unmatched_phantom') and the 2 missing
 * transactions were backfilled (source='csv_import', status='pending_categorization' -- same path the
 * app's own Statement Import feature uses for a manually-supplied row). Root cause of the 36: almost
 * all carry pending=true/dedup_hash=null -- stale Plaid PENDING duplicates never retired when their
 * POSTED successor arrived (bank-tx-dedup.ts's own documented failure mode; CC-1 already swept this
 * class system-wide on 2026-09-07 per scripts/ops/2026-09-07-cc1-bank-running-balance-plaid-pending-
 * dedup-sweep.ts -- this account's 36 are residue outside that one-shot sweep's window).
 *
 * PROOF: live signed sum (is_credit ? +abs : -abs) over every non-voided row on this account equals
 * 638972 cents -- the statement's own printed ending-balance line, to the penny -- REGARDLESS of
 * which of the two conventions above amount_cents' raw sign follows on a given row, since this
 * formula never reads that raw sign.
 *
 * This guard is a REGRESSION lock, not a daily balance check (the balance moves every day as new
 * transactions post) -- it pins the 36 voided ids + 2 backfilled ids by id and re-derives the
 * point-in-time reconciliation total using ONLY those pinned rows plus every OTHER row dated on or
 * before 2026-09-09 (the statement's own cutoff), so it stays green as new, later-dated activity
 * arrives, and green regardless of which sign convention any given row uses.
 */

const LABEL = "verify-reg030-bofa-usmca-freight-reconciliation";
const BANK_ACCOUNT_ID = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const STATEMENT_CUTOFF_DATE = "2026-09-09";
const STATEMENT_ENDING_BALANCE_CENTS = 638972; // statement's own printed "6,389.72" line

const VOIDED_PHANTOM_IDS = [
  "018b621c-ba43-4d7b-91ef-938b9fae8712",
  "022846b3-2260-47f2-96c2-34ac6120a83d",
  "0a0e8a54-9666-486d-86e3-f51c94173be7",
  "0f6deec7-29d0-4e35-9c3d-65337b24cccd",
  "10d007e5-fa86-4f7f-90f6-3603f362046e",
  "14222e53-8fae-4288-8dc5-9a71ef974047",
  "15a82eca-6531-4c25-91b2-b5ff989a32d1",
  "1a2ebf6a-c3f7-4b46-9e70-a76380ffe473",
  "1f5b86e4-a2d4-41bb-9def-06dd980cbf78",
  "337f5d0a-6f40-4bfc-92d8-1553e5f4ac20",
  "460de114-c448-4782-a21e-0e4a04a324ff",
  "48aaa37d-a48a-495c-9105-f3ba3ac95bee",
  "4b6fbd94-4f75-4a4e-84d8-20bc324bdf1b",
  "5b551587-402e-47ab-9600-f613e50ad2f5",
  "6098e91d-c091-49a8-b198-cce9994e32b7",
  "63c048b3-18f3-4812-96d2-25e93a427e65",
  "64008d4b-1c35-423d-9d8b-50019a62e622",
  "6ba3a441-625f-4b78-9939-6eb080514f1e",
  "6c6956ea-9a36-41c2-bfc6-487023407a20",
  "823aa769-94f2-43e0-bbde-0a985536a93b",
  "836e79dd-61f9-42ea-b042-c6a88a54ccb6",
  "85646bdf-eb77-4763-a1db-b46e337c3457",
  "936b38fa-7d53-4b57-b136-613f18f16b16",
  "95c10852-4ea3-4e64-b2ac-ddc01b7874ae",
  "9cadab60-9503-4216-a01f-5024e1ea5eaa",
  "9e00ccb7-f7df-44bf-8efd-6fa851649e0d",
  "a2e455d2-be6d-4dbb-8bbb-34acafee1d83",
  "a82b45e7-8d73-4941-92e5-b09627c0fb57",
  "b81207e4-45db-4ed5-8d98-69ee2ab907b0",
  "bfba8e5c-8e9d-4f55-a7ed-32cb38d1fd79",
  "bfbd314f-2dad-4c0a-a7aa-f00e518b92a4",
  "c819fccc-35e7-4b86-ae91-77b20456db1c",
  "cbde5953-b340-4461-9f8e-273416ea3879",
  "e1b2873d-f9d7-4df6-83fb-dd049bb14f58",
  "f2df847d-a255-4430-b7f5-8038def5a960",
  "fe62eecd-a2b6-4abf-b1c5-a1572e574779",
];

const BACKFILLED_IDS = ["24374e31-1c15-4851-8c1e-85034b3c0247", "dfbaa0f3-5d66-4934-9c68-93524fa3a96f"];

if (VOIDED_PHANTOM_IDS.length !== 36) {
  console.error(`${LABEL}: FAIL — internal: expected 36 pinned phantom ids, got ${VOIDED_PHANTOM_IDS.length}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  // Pure shape check: the pinned id lists are well-formed and non-overlapping.
  const overlap = VOIDED_PHANTOM_IDS.filter((id) => BACKFILLED_IDS.includes(id));
  if (overlap.length > 0) {
    console.error(`${LABEL}: SELFTEST FAIL — an id appears in both the voided and backfilled lists: ${overlap.join(",")}`);
    process.exit(1);
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const bad = [...VOIDED_PHANTOM_IDS, ...BACKFILLED_IDS].filter((id) => !uuidRe.test(id));
  if (bad.length > 0) {
    console.error(`${LABEL}: SELFTEST FAIL — malformed id(s): ${bad.join(",")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS (${VOIDED_PHANTOM_IDS.length} voided ids, ${BACKFILLED_IDS.length} backfilled ids, no overlap)`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live reconciliation re-check (pinned-id shape already validated).`);
  console.log(`${LABEL}: to re-run live: DATABASE_URL=<prod> node ${process.argv[1]}`);
  process.exit(0);
}

const { Client } = await import("pg");
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

  const control = await client.query(
    `SELECT count(*)::int AS n FROM banking.bank_transactions WHERE bank_account_id = $1`,
    [BANK_ACCOUNT_ID]
  );
  if (control.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — control=0 rows for this account, this connection cannot see the ledger (masked read, not a verdict)`);
    process.exit(1);
  }

  // 1) the 36 pinned phantom ids must still be voided with the reconciliation's own reason.
  const stillLive = await client.query(
    `SELECT id::text FROM banking.bank_transactions
     WHERE id = ANY($1::uuid[]) AND (voided_at IS NULL OR voided_reason IS DISTINCT FROM 'reg030_bofa_statement_unmatched_phantom')`,
    [VOIDED_PHANTOM_IDS]
  );
  if (stillLive.rows.length > 0) {
    console.error(
      `${LABEL}: FAIL — ${stillLive.rows.length} previously-voided phantom row(s) are no longer voided (or lost their reason): ${stillLive.rows
        .map((r) => r.id)
        .join(",")}`
    );
    process.exit(1);
  }

  // 2) the 2 backfilled ids must exist, be live, and carry the honest csv_import source.
  const backfilled = await client.query(
    `SELECT id::text, voided_at, source FROM banking.bank_transactions WHERE id = ANY($1::uuid[])`,
    [BACKFILLED_IDS]
  );
  if (backfilled.rows.length !== BACKFILLED_IDS.length) {
    console.error(`${LABEL}: FAIL — expected ${BACKFILLED_IDS.length} backfilled row(s), found ${backfilled.rows.length}`);
    process.exit(1);
  }
  const badBackfill = backfilled.rows.filter((r) => r.voided_at !== null || r.source !== "csv_import");
  if (badBackfill.length > 0) {
    console.error(`${LABEL}: FAIL — backfilled row(s) voided or mis-sourced: ${JSON.stringify(badBackfill)}`);
    process.exit(1);
  }

  // 3) point-in-time reconciliation: sum every non-voided row on/before the statement cutoff using
  //    the EXISTING is_credit convention (no sign correction) must equal the statement's own printed
  //    ending-balance line, to the penny.
  const sumRes = await client.query(
    `SELECT sum(CASE WHEN is_credit THEN abs(amount_cents) ELSE -abs(amount_cents) END)::bigint AS signed_sum
     FROM banking.bank_transactions
     WHERE bank_account_id = $1 AND voided_at IS NULL AND transaction_date <= $2::date`,
    [BANK_ACCOUNT_ID, STATEMENT_CUTOFF_DATE]
  );
  const signedSum = Number(sumRes.rows[0].signed_sum);
  await client.query("ROLLBACK");

  if (signedSum !== STATEMENT_ENDING_BALANCE_CENTS) {
    console.error(
      `${LABEL}: FAIL — live signed sum through ${STATEMENT_CUTOFF_DATE} is ${signedSum} cents, statement's own printed line is ${STATEMENT_ENDING_BALANCE_CENTS} cents (control=${control.rows[0].n})`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL}: PASS — 36 pinned phantom rows still voided, 2 backfilled rows present and live, live signed sum through ${STATEMENT_CUTOFF_DATE} = ${signedSum} cents == statement's own printed ending balance $6,389.72 (control=${control.rows[0].n})`
  );
} finally {
  await client.end().catch(() => {});
}
