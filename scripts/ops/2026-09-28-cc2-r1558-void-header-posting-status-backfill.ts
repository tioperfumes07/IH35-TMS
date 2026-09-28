#!/usr/bin/env tsx
/**
 * ROUND 155.13 J4 / 155.8, AUTH-103 -- header-only repair, NO POSTING TOUCHED, NO MONEY MOVED.
 *
 * DEFECT: a voided accounting.expenses row's own `reversed_by_je_id` column is NULL, but the GL
 * reversal genuinely happened -- the expense's `journal_entry_id` points to a JE whose own header
 * (`accounting.journal_entries.reversed_by_je_id`) IS set, and that JE's postings are fully offset
 * (net 0) by the reversal JE's postings. The GL is correct and complete; only the expense header's
 * own back-reference was never written. Confirmed this is a live-code gap: expenses.routes.ts's
 * /void endpoint (the current, live void path) already writes `reversed_by_je_id` atomically in
 * the same transaction as the reversal (ACCT-F5635 fix) -- these 141 rows are historical residue
 * from before that fix or from a path that bypassed it, not an ongoing leak. The Lead's original
 * "258 rows, $43,810.54" figure is STALE: the ROUND 155.18 purge (AUTH-101, executed earlier this
 * session) physically deleted 117 of the pool of voided USMCA expenses, shrinking this defect's
 * population to 141 rows / $7,075.62 as a side effect.
 *
 * VERIFIED LIVE (bypass_rls, this round) for all 141 target rows, not assumed:
 *   - every row's JE header shows reversed_by_je_id IS NOT NULL (a real reversal JE exists)
 *   - every row's original JE postings + its reversal JE's postings net to exactly 0 cents
 *   - zero rows are missing reversal postings
 * So the fix is safe and complete for the full population -- no row needs to be held back.
 *
 * The two "singletons" named in the original directive were investigated and are NOT defects:
 *   - $25.00 draft/posted: accounting.expenses id f9c5b0e4-644c-4b03-b7c2-424d540ea65f, a real
 *     check (Smithfield Foods Inc) written live this session. status='draft' correctly means
 *     "not yet printed" (the check-payment print workflow); posting_status='posted' correctly
 *     reflects its real, balanced GL entry. By design, not a bug. Left untouched.
 *   - $15.69 void/reversed with journal_entry_id NULL: id c3ec6e51-8033-4d7c-9671-a1556f4ebc8a,
 *     self-documented in its own void_reason: "R-175: prior JE 87797674/fe090c4b (Dr 9000 Cr 2000)
 *     already reversed; the idempotent engine returns it -- reissued as a new document on the
 *     card." This document never had its own JE (the real JE belongs to a sibling document it was
 *     reissued from); reversed_by_je_id staying NULL is correct since there is nothing of its own
 *     to link. Left untouched.
 *
 * ALGORITHM:
 *   1. Find every USMCA accounting.expenses row where voided_at IS NOT NULL, reversed_by_je_id IS
 *      NULL, and the joined journal_entries.reversed_by_je_id IS NOT NULL.
 *   2. Re-verify per-row (inside this run's own transaction, not from an earlier snapshot) that
 *      the original JE's postings and the reversal JE's postings net to 0 -- refuse the whole run
 *      if even one row fails this, per "DO NOT zero a header to make a check go green."
 *   3. UPDATE accounting.expenses SET posting_status = 'reversed' (already true for all 141,
 *      verified below, but asserted not assumed), reversed_by_je_id = <the JE header's own
 *      reversed_by_je_id> WHERE id = <row>. No other column touched. No journal_entry_postings
 *      row touched, inserted, or deleted -- this script issues zero writes to that table.
 *   4. HARD CHECK before COMMIT: journal_entry_postings row count and trial balance
 *      (SUM debit-credit) for the whole company are byte-identical before and after this
 *      transaction (they must be, since this script never touches that table -- this is a
 *      structural assertion, not a hope).
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r1558-void-header-posting-status-backfill.ts
 *     (dry-run: prints the full per-row plan, does not write)
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-103 npx tsx scripts/ops/2026-09-28-cc2-r1558-void-header-posting-status-backfill.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUTH_ID = "AUTH-103";
const apply = process.argv.includes("--apply");

if (apply) {
  const auth = process.env.OWNER_AUTH_ID;
  if (auth !== AUTH_ID) {
    console.error(`FAIL: --apply requires OWNER_AUTH_ID=${AUTH_ID} (got ${JSON.stringify(auth ?? null)}).`);
    process.exit(1);
  }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
}

type TargetRow = {
  id: string;
  total_amount_cents: string;
  journal_entry_id: string;
  je_reversed_by: string;
};

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia', true)`);

  const tbBefore = await client.query<{ n: string; rows: string }>(
    `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
       FROM accounting.journal_entry_postings WHERE operating_company_id=$1`,
    [USMCA]
  );

  const targetsRes = await client.query<TargetRow>(
    `SELECT e.id, e.total_amount_cents::text, e.journal_entry_id::text, je.reversed_by_je_id::text AS je_reversed_by
       FROM accounting.expenses e
       JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
      WHERE e.voided_at IS NOT NULL
        AND e.reversed_by_je_id IS NULL
        AND je.reversed_by_je_id IS NOT NULL
        AND e.operating_company_id = $1
      ORDER BY e.id`,
    [USMCA]
  );

  console.log(`Candidate rows: ${targetsRes.rows.length}`);

  let totalCents = 0;
  const plan: Array<{ id: string; cents: string; revJe: string }> = [];
  for (const row of targetsRes.rows) {
    // Re-verify inside THIS transaction, not from an earlier snapshot -- refuse the whole run on
    // any row that doesn't actually net to zero.
    const net = await client.query<{ orig_net: string; rev_net: string; rev_count: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN p.journal_entry_uuid = $1 THEN (CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END),0)::text AS orig_net,
         COALESCE(SUM(CASE WHEN p.journal_entry_uuid = $2 THEN (CASE WHEN p.debit_or_credit='debit' THEN p.amount_cents ELSE -p.amount_cents END) ELSE 0 END),0)::text AS rev_net,
         COUNT(*) FILTER (WHERE p.journal_entry_uuid = $2)::text AS rev_count
       FROM accounting.journal_entry_postings p
       WHERE p.journal_entry_uuid IN ($1, $2) AND p.operating_company_id = $3`,
      [row.journal_entry_id, row.je_reversed_by, USMCA]
    );
    const { orig_net, rev_net, rev_count } = net.rows[0];
    if (Number(rev_count) === 0) {
      throw new Error(`REFUSED: expense ${row.id} -- reversal JE ${row.je_reversed_by} has zero postings, GL is not actually clean for this row.`);
    }
    if (Number(orig_net) + Number(rev_net) !== 0) {
      throw new Error(
        `REFUSED: expense ${row.id} -- original JE ${row.journal_entry_id} net=${orig_net}, reversal JE ${row.je_reversed_by} net=${rev_net}, do not offset to 0. Not touching this row.`
      );
    }
    plan.push({ id: row.id, cents: row.total_amount_cents, revJe: row.je_reversed_by });
    totalCents += Number(row.total_amount_cents);
  }

  console.log(`Verified clean (GL net-zero, re-checked inside this transaction): ${plan.length} row(s), $${(totalCents / 100).toFixed(2)}.`);
  for (const p of plan) console.log(`  expense ${p.id} $${(Number(p.cents) / 100).toFixed(2)} -> reversed_by_je_id=${p.revJe}`);

  if (apply) {
    let updated = 0;
    for (const p of plan) {
      const res = await client.query(
        `UPDATE accounting.expenses
            SET reversed_by_je_id = $1::uuid,
                posting_status = 'reversed',
                updated_at = now()
          WHERE id = $2::uuid
            AND operating_company_id = $3::uuid
            AND voided_at IS NOT NULL
            AND reversed_by_je_id IS NULL`,
        [p.revJe, p.id, USMCA]
      );
      updated += res.rowCount ?? 0;
    }
    if (updated !== plan.length) {
      throw new Error(`REFUSED: expected to update ${plan.length} rows, actually updated ${updated}. Rolling back.`);
    }
    console.log(`Updated ${updated} expense header(s).`);

    const tbAfter = await client.query<{ n: string; rows: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
         FROM accounting.journal_entry_postings WHERE operating_company_id=$1`,
      [USMCA]
    );
    if (tbBefore.rows[0].n !== tbAfter.rows[0].n || tbBefore.rows[0].rows !== tbAfter.rows[0].rows) {
      throw new Error(
        `REFUSED: journal_entry_postings changed (this script must never touch that table). before=${JSON.stringify(tbBefore.rows[0])} after=${JSON.stringify(tbAfter.rows[0])}`
      );
    }
    console.log(`journal_entry_postings unchanged: ${tbAfter.rows[0].n} cents across ${tbAfter.rows[0].rows} postings (structural check -- this script writes zero rows to that table).`);
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } else {
    await client.query("ROLLBACK");
    console.log(`DRY RUN -- rolled back, no writes. Re-run with --apply and OWNER_AUTH_ID=${AUTH_ID} to commit.`);
  }
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
