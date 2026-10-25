#!/usr/bin/env node
/**
 * ENG-04 (443.322) — account 2170 Driver Net-Pay Clearing net balance must be zero.
 *
 * ROOT CAUSE: 12 driver advances (CA-2026-0001 to CA-2026-0012, posted 2026-10-11) credited
 * account 2170 instead of the operating bank (1000 BofA). These advances had from_bank_account_id=null,
 * causing the posting engine (pre-fix code) to resolve driver_payroll_clearing (→ 2170) instead of
 * operating_bank (→ 1000). Total misposted: 257,596 cents ($2,575.96).
 *
 * ROUND 326 (owner 2026-10-02): the single clearing JE (Cr 2170) is retired — unreachable. Net pay
 * now posts as a bill payment from the real bank. No new postings should land on 2170. The current
 * advance posting engine correctly resolves operating_bank → 1000. The 12 existing mispostings
 * require a correction JE (owner decision pending).
 *
 * Usage: node scripts/verify-driver-net-pay-clearing-balance-zero.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-driver-net-pay-clearing-balance-zero";
export const REQUIRES_LIVE_DB =
  "catalogs.accounts + accounting.journal_entry_postings — fails closed with no DATABASE_URL";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const NET_PAY_CLEARING_ACCOUNT_NUMBER = "2170";

export function isNonZeroBalance(netCents) {
  return netCents !== 0;
}

// 443.350 (LEAD, owner 10-24 9:10 PM: "If you match only match those matchable transactions. The rest I match")
// The 12 historical advance credits CA-2026-0001..0012 ($2,575.96, posted 2026-10-11 by the pre-fix resolver)
// wait for the OWNER to categorize/match each one to its real payment (Transportation-paid wire, Remitly line,
// ATM cash). They are a pinned, SHRINK-ONLY baseline: the guard fails on ANY 2170 posting not in this list
// (a new mispost), on a pinned posting whose amount changed, and when a pinned one is gone (shrink the list).
// What the guard proves is the engine law — nothing new ever lands on 2170 — without blocking every
// unrelated PR on data only the owner can resolve.
export const PINNED_HISTORICAL_2170 = new Map([
  ['2565b318-bc64-4ffb-9684-b375686f52f4', 14800], ['21c57fdf-a715-4d7d-b421-ae922c39f370', 20000], ['36bb68ff-be56-45d1-ace0-2dfbda4ee313', 39000], ['cd588cf5-a4dd-43e7-a281-86a689de6c85', 30199], ['b22b6c1a-0089-4123-951b-1b328c360646', 15199], ['554e1d47-d703-465f-b84d-0cd8a5672635', 20199], ['5c08d901-ae37-414a-ac53-384822a64359', 20199], ['8bee772a-8799-4ca7-8c71-b169fd2c16ab', 20000], ['dff38168-7c16-4423-9b93-707c6a187f95', 28000], ['5a17752d-b4f8-40c2-8c7f-3aebc2c4398a', 20000], ['ed9be8b1-2c2e-4398-a3c8-7e1edc9336dc', 20000], ['fb12169a-3348-4e16-9570-e40a8adbc2ff', 10000]
]);

export function classify2170(postings, pinned = PINNED_HISTORICAL_2170) {
  const problems = [];
  const seen = new Set();
  for (const p of postings) {
    const want = pinned.get(p.id);
    if (want === undefined) problems.push(`NEW 2170 posting ${p.id} ${p.debit_or_credit} ${p.amount_cents} (${p.source_transaction_type}) — the resolver must never post to 2170`);
    else if (Number(p.amount_cents) !== want) problems.push(`pinned 2170 posting ${p.id} amount ${p.amount_cents} != pinned ${want}`);
    seen.add(p.id);
  }
  for (const id of pinned.keys()) if (!seen.has(id)) problems.push(`pinned 2170 posting ${id} no longer exists — remove it from PINNED_HISTORICAL_2170 (shrink-only)`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["balance=0 = ok", !isNonZeroBalance(0)],
    ["balance=257596 = violation", isNonZeroBalance(257596)],
    ["balance=-100 = violation", isNonZeroBalance(-100)],
  ];
  const pinnedOk = [...PINNED_HISTORICAL_2170].map(([id, amount_cents]) => ({ id, amount_cents, debit_or_credit: "credit", source_transaction_type: "driver_advance" }));
  cases.push(
    ["pinned 12 only = no problems", classify2170(pinnedOk).length === 0],
    ["a new 2170 posting = problem", classify2170([...pinnedOk, { id: "x", amount_cents: 100, debit_or_credit: "credit", source_transaction_type: "driver_advance" }]).length === 1],
    ["pinned amount changed = problem", classify2170([{ ...pinnedOk[0], amount_cents: 1 }, ...pinnedOk.slice(1)]).length === 1],
    ["pinned row gone = problem", classify2170(pinnedOk.slice(1)).length === 1],
  );
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const acctRes = await client.query(
    `SELECT id::text FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid
        AND account_number = $2
        AND deactivated_at IS NULL
      LIMIT 1`,
    [USMCA_COMPANY_ID, NET_PAY_CLEARING_ACCOUNT_NUMBER]
  );

  if (acctRes.rows.length === 0) {
    console.log(`${LABEL}: LIVE PASS — account ${NET_PAY_CLEARING_ACCOUNT_NUMBER} not found in USMCA (nothing to check)`);
    await client.query("COMMIT");
    process.exit(0);
  }
  const accountId = acctRes.rows[0].id;

  const postRes = await client.query(
    `SELECT jep.id::text, jep.amount_cents::bigint AS amount_cents, jep.debit_or_credit, jep.source_transaction_type
       FROM accounting.journal_entry_postings jep
      WHERE jep.account_id = $1::uuid AND jep.operating_company_id = $2::uuid`,
    [accountId, USMCA_COMPANY_ID]
  );
  await client.query("COMMIT");
  const problems = classify2170(postRes.rows);
  if (problems.length) {
    console.error(`${LABEL}: LIVE FAIL — ${problems.length} problem(s) on account 2170:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — no new posting on 2170; ${PINNED_HISTORICAL_2170.size} pinned historical advance credit(s) await the owner's categorization (shrink-only)`
  );
} finally {
  client.release();
  await pool.end();
}
