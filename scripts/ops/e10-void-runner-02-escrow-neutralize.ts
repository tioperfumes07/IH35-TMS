#!/usr/bin/env tsx
// E10 -- ESCROW HALF (Round 91/92, owner-ordered). accounting.escrow_accounts.balance_cents is
// a DERIVED balance maintained by trg_apply_escrow_posting_delta (an INSERT trigger on
// accounting.escrow_postings, migration 0234) -- it is not itself a JE and none of the six
// reversal engines touch it directly. The honest way to prove it zero without a raw UPDATE
// (which would be new GL math outside the existing poster) is to insert the MIRROR of every
// real posting: an equal-and-opposite entry for each deposit/release, letting the SAME trigger
// that built the balance walk it back to zero.
//
// Uses the EXISTING poster only -- recordEscrowPostingOnly (accounting/escrow/service.ts), the
// same function ACCT-R-01 already requires every driver_finance-side escrow writer to call (see
// historical-escrow-backfill.service.ts this session). No new trigger, no trigger dropped, no
// raw balance UPDATE.
//
// The 61 real postings are NEVER touched -- they stay, void-not-delete, as history. This script
// only INSERTs 61 new mirror rows (source_type='reconciliation', note naming this purge and the
// original posting id it mirrors).
//
// PROVING GROUND ONLY: br-spring-dream-akk31fyt (a clean copy of production at LSN E7/9936D28),
// never br-sweet-math-akyen17f (Cursor-truncated), never production.
//
// ROUND 95 FIX -- SKIP REPAIR-PAIR ROWS (Lead ruling, docs/bus/09-23-2026-LEAD-THE-500.01-ESCROW-
// RESIDUAL-EXPLAINED.md, measured live on production). A 2026-09-02 two-step correction
// (MARK/WORM REVERSE) already walked 3 accounts to exactly 0 -- but the release leg was written
// for double the deposit, so the POSTING LEDGER on those 3 accounts is $500.01 short of the
// balances even though the balances themselves are correct. Mirroring these six rows would
// mirror a correction of a correction, moving three accounts that are already at 0 OFF zero --
// "the cure would create the disease." These rows self-identify: source_type='reconciliation',
// source_id IS NULL, no linked_journal_entry_id. Skipped below, named in the output, never
// silently dropped.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { recordEscrowPostingOnly, type EscrowSourceType } from "../../apps/backend/src/accounting/escrow/service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST naming the exact proving-ground host.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL host does not match ROUND271_ALLOW_HOST.");
  if (/ep-broad-block-akykk7bw/.test(url)) throw new Error("ABORT: refusing the production compute host, by name, unconditionally.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query("RESET ROLE");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);

  const before = await client.query<{ n: string; total_cents: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(balance_cents),0)::text AS total_cents FROM accounting.escrow_accounts WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  console.log(`BEFORE: accounting.escrow_accounts -- ${before.rows[0]!.n} rows, net balance $${(Number(before.rows[0]!.total_cents) / 100).toFixed(2)}`);

  const skipped = await client.query<{ id: string; note: string | null }>(
    `
      SELECT ep.id::text, ep.note
        FROM accounting.escrow_postings ep
        JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id
       WHERE ea.operating_company_id = $1::uuid
         AND ep.source_type = 'reconciliation' AND ep.source_id IS NULL AND ep.linked_journal_entry_id IS NULL
    `,
    [USMCA_COMPANY_ID]
  );
  for (const s of skipped.rows) console.log(`  SKIP (repair-pair row, Lead ruling): posting ${s.id} -- ${s.note ?? "(no note)"}`);

  const postings = await client.query<{ id: string; escrow_account_id: string; posting_type: string; amount_cents: string; driver_id: string }>(
    `
      SELECT ep.id::text, ep.escrow_account_id::text, ep.posting_type, ep.amount_cents::text, ea.holder_id::text AS driver_id
        FROM accounting.escrow_postings ep
        JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id
       WHERE ea.operating_company_id = $1::uuid
         AND NOT (ep.source_type = 'reconciliation' AND ep.source_id IS NULL AND ep.linked_journal_entry_id IS NULL)
       ORDER BY ep.posted_at ASC, ep.id ASC
    `,
    [USMCA_COMPANY_ID]
  );
  console.log(`Real postings to mirror (excluding ${skipped.rowCount} repair-pair rows): ${postings.rowCount}`);
  let sumSigned = 0;
  for (const p of postings.rows) sumSigned += (p.posting_type === "deposit" ? 1 : p.posting_type === "release" ? -1 : 0) * Number(p.amount_cents);
  console.log(`Signed net of real postings (deposit +, release -): $${(sumSigned / 100).toFixed(2)}`);

  if (!executeFlag) {
    client.release();
    await pool.end();
    console.log("\nDRY RUN -- no writes made.");
    return;
  }

  let mirrored = 0;
  for (const p of postings.rows) {
    if (p.posting_type !== "deposit" && p.posting_type !== "release") {
      console.log(`  SKIP posting ${p.id}: posting_type='${p.posting_type}' is neither deposit nor release -- not mirrored, named not guessed.`);
      continue;
    }
    const mirrorType = p.posting_type === "deposit" ? "release" : "deposit";
    await recordEscrowPostingOnly(client, {
      operating_company_id: USMCA_COMPANY_ID,
      driver_id: p.driver_id,
      posting_type: mirrorType,
      amount_cents: Number(p.amount_cents),
      source_type: "reconciliation" as EscrowSourceType,
      source_id: p.id,
      note: `E10 void-runner reconciliation mirror -- offsets original escrow_postings.id=${p.id} (${p.posting_type}) as part of the pre-purge unwind. Proving ground only.`,
      posted_by_user_id: OWNER_USER_ID,
    });
    mirrored++;
  }
  console.log(`Mirrored ${mirrored} postings.`);

  const after = await client.query<{ n: string; total_cents: string }>(
    `SELECT count(*)::text AS n, COALESCE(sum(balance_cents),0)::text AS total_cents FROM accounting.escrow_accounts WHERE operating_company_id = $1::uuid`,
    [USMCA_COMPANY_ID]
  );
  console.log(`\nAFTER: accounting.escrow_accounts -- ${after.rows[0]!.n} rows, net balance $${(Number(after.rows[0]!.total_cents) / 100).toFixed(2)}`);
  const nonZero = await client.query<{ id: string; balance_cents: string }>(
    `SELECT id::text, balance_cents::text FROM accounting.escrow_accounts WHERE operating_company_id = $1::uuid AND balance_cents != 0`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Non-zero escrow_accounts rows remaining: ${nonZero.rowCount}`);
  for (const r of nonZero.rows) console.log(`  ${r.id}: $${(Number(r.balance_cents) / 100).toFixed(2)}`);

  const originalsStillPresent = await client.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM accounting.escrow_postings ep JOIN accounting.escrow_accounts ea ON ea.id = ep.escrow_account_id WHERE ea.operating_company_id = $1::uuid AND ep.source_type != 'reconciliation'`,
    [USMCA_COMPANY_ID]
  );
  console.log(`Original (non-reconciliation) postings still present: ${originalsStillPresent.rows[0]!.n} (expect 61 -- none deleted, void-not-delete)`);

  client.release();
  await pool.end();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
