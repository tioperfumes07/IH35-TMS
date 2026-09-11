#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["data_integrity","sign_convention"],"leafRe":"^banking\\.reconciliation\\.sign_convention_usmca$","task":"BANK-SIGN-CONVENTION-BACKFILL-AUDIT"} */
/**
 * BANK SIGN-CONVENTION BACKFILL — USMCA-SCOPED AUDIT (owner-approved backfill, 2026-09-11).
 *
 * SCOPE LAW: USMCA only (operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80).
 * TRANSPORTATION/TRUCKING is frozen — never read, written, or reported on by this guard or its
 * author. This file and its live query are hard-scoped to USMCA by a WHERE clause, not by
 * convention, so it structurally cannot surface another entity's data even by accident.
 *
 * BACKGROUND: PR #21744 redefined banking.bank_transactions.amount_cents' stored sign convention
 * GOING FORWARD via plaidAmountToStatementCents() in plaid.service.ts, and retroactively re-signed
 * USMCA FREIGHT's Bank of America account (e83028a5-...) to match — see
 * scripts/verify-reg030-bofa-usmca-freight-reconciliation.mjs for the full history and its own
 * pinned-id regression lock on that account.
 *
 * LIVE-AUDITED THIS SESSION (Neon tiny-field-89581227, bypass_rls=lucia, WHERE operating_company_id
 * = USMCA only): USMCA has exactly ONE bank account with any Plaid-sourced rows — the same BofA
 * account reg030 already covers — 286/286 non-voided Plaid rows on the NEW convention, 0 old, 0
 * mixed. Every other USMCA-scoped bank_accounts row (a second, deactivated BofA link; Faro
 * Factoring - USMCA; Relay Fuel Wallet - USMCA; a deactivated TEST DATA Amex; Petty Cash) has ZERO
 * bank_transactions rows of any kind. So under the USMCA-only scope law, there is currently NOTHING
 * to backfill: the one live USMCA Plaid account is already fully corrected.
 *
 * WHAT THIS GUARD DOES: a live, read-only, USMCA-scoped regression lock — not a backfill (there is
 * nothing left to backfill in-scope) — that fails closed if ANY USMCA-scoped, Plaid-sourced,
 * non-voided row is ever found on the old convention, or if USMCA convention data is internally
 * mixed. This generalizes reg030's own account-specific pinned check to cover any FUTURE USMCA Plaid
 * account (a newly linked USMCA bank account, for instance) without needing a new guard each time.
 *
 * OUT OF SCOPE, NOT DECIDED HERE: whether other entities' pre-existing Plaid rows (outside USMCA)
 * need a similar backfill is a question for whichever seat owns that entity's banking lane, per the
 * standing seat-ownership law. This guard does not query, count, or report on them.
 */

const LABEL = "verify-bank-sign-convention-per-account-audit";
const USMCA_OPERATING_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function classify(rows) {
  const mixed = [];
  const oldConventionOnly = [];
  for (const r of rows) {
    if (r.newCount > 0 && r.oldCount > 0) {
      mixed.push(r);
      continue;
    }
    if (r.oldCount > 0 && r.newCount === 0) {
      oldConventionOnly.push(r);
    }
  }
  return { mixed, oldConventionOnly };
}

function runSelftest() {
  const cases = [
    {
      name: "clean new-convention-only account — no error",
      rows: [{ id: "11111111-1111-1111-1111-111111111111", newCount: 50, oldCount: 0, zeroCount: 0 }],
      wantMixed: 0,
      wantOld: 0,
    },
    {
      name: "old-convention-only account — FAILS (nothing is expected to be old-convention within USMCA scope)",
      rows: [{ id: "22222222-2222-2222-2222-222222222222", newCount: 0, oldCount: 10, zeroCount: 0 }],
      wantMixed: 0,
      wantOld: 1,
    },
    {
      name: "mixed new+old within the same account — FAILS",
      rows: [{ id: "33333333-3333-3333-3333-333333333333", newCount: 5, oldCount: 5, zeroCount: 0 }],
      wantMixed: 1,
      wantOld: 0,
    },
    {
      name: "no Plaid rows at all — no error",
      rows: [],
      wantMixed: 0,
      wantOld: 0,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const { mixed, oldConventionOnly } = classify(c.rows);
    const ok = mixed.length === c.wantMixed && oldConventionOnly.length === c.wantOld;
    if (!ok) {
      failed++;
      console.error(
        `  ✗ ${c.name}: expected mixed=${c.wantMixed}/old=${c.wantOld}, got mixed=${mixed.length}/old=${oldConventionOnly.length}`
      );
    } else {
      console.log(`  ok    ${c.name}`);
    }
  }

  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED (${failed} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.log(`${LABEL}: DATABASE_URL not set — skipping the live USMCA-scoped audit (selftest already validates the classifier).`);
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
    `SELECT count(*)::int AS n FROM banking.bank_transactions WHERE source = 'plaid' AND operating_company_id = $1`,
    [USMCA_OPERATING_COMPANY_ID]
  );
  if (control.rows[0].n === 0) {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: PASS (control=0 — no USMCA Plaid rows visible right now; nothing to check, not a masked-read verdict since USMCA's only Plaid account, e83028a5-..., is separately positive-controlled by verify-reg030-bofa-usmca-freight-reconciliation.mjs)`);
    process.exit(0);
  }

  const res = await client.query(
    `SELECT
      bank_account_id::text AS id,
      count(*) FILTER (WHERE amount_cents = CASE WHEN is_credit THEN abs(amount_cents) ELSE -abs(amount_cents) END AND amount_cents <> 0)::int AS "newCount",
      count(*) FILTER (WHERE amount_cents = CASE WHEN is_credit THEN -abs(amount_cents) ELSE abs(amount_cents) END AND amount_cents <> 0)::int AS "oldCount"
    FROM banking.bank_transactions
    WHERE source = 'plaid' AND voided_at IS NULL AND operating_company_id = $1
    GROUP BY bank_account_id`,
    [USMCA_OPERATING_COMPANY_ID]
  );
  await client.query("ROLLBACK");

  const { mixed, oldConventionOnly } = classify(res.rows);

  if (mixed.length > 0) {
    console.error(`${LABEL}: FAIL — ${mixed.length} USMCA account(s) have BOTH old- and new-convention Plaid rows mixed within the same account:`);
    for (const m of mixed) console.error(`  ${m.id}: new=${m.newCount} old=${m.oldCount}`);
    process.exit(1);
  }
  if (oldConventionOnly.length > 0) {
    console.error(`${LABEL}: FAIL — ${oldConventionOnly.length} USMCA account(s) are old-convention-only (regression — USMCA's only known Plaid account was already corrected via REG-030):`);
    for (const o of oldConventionOnly) console.error(`  ${o.id}: old=${o.oldCount}`);
    process.exit(1);
  }

  console.log(`${LABEL}: PASS (control=${control.rows[0].n}) — every USMCA Plaid-sourced row is on the new sign convention, no mixing, no regression.`);
} finally {
  await client.end().catch(() => {});
}
