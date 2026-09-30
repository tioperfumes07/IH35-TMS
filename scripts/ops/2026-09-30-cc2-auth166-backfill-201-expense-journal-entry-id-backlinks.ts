#!/usr/bin/env -S npx tsx
/**
 * AUTH-166 -- backfill accounting.expenses.journal_entry_id for 201 USMCA expense rows whose
 * backlink is stale/missing, closing 201 of 204 verify-costs-are-expenses-not-handwritten-jes
 * violations (baseline 0, shrink-only; R-153.6 CC-2 owns the writer).
 *
 * ROOT CAUSE: 201 accounting.expenses rows are the source_transaction_id of a LIVE (posted,
 * non-reversed, non-reversing), USMCA, 5xxx/6xxx-debit journal entry, but expenses.journal_entry_id
 * does not point at that live JE:
 *   - 98 rows: journal_entry_id IS NULL -- the writer never stamped it (older writer/import).
 *   - 103 rows: journal_entry_id points at an OLDER JE that has since been voided/reversed
 *     (reversed_by_je_id IS NOT NULL on the old JE) and re-posted under a NEW live JE (e.g. an
 *     account-correction re-post) -- the correction path updated the postings but never updated
 *     the expense's own backlink to the new JE.
 * The document itself was never missing (that's why this is a metadata backlink gap, not a
 * handwritten-JE defect): the guard's own has_expense_row check is `journal_entry_id` on
 * accounting.expenses only.
 *
 * SAFETY CHECK (live-verified before this script was written, not assumed): queried every
 * accounting.expenses row referenced by a live USMCA cost-debit JE (536 total) -- ALL 536 have
 * EXACTLY ONE live JE referencing them. Zero expenses have more than one live JE, so this is a
 * pure backlink-pointer correction, not a duplicate-posting/double-count risk (contrast AUTH-165).
 *
 * NOT covered by this AUTH: the remaining 3 of 204 violations are 'bill'-sourced
 * (accounting.bills has NO journal_entry_id column at all -- structurally impossible to backfill;
 * this is a guard-scope gap, not a data defect, and is flagged to CC-3 (R-153.7, guard owner)
 * separately, not touched here).
 *
 * Each target is re-verified live immediately before writing: the expense row still exists, is
 * not soft-deleted, belongs to USMCA, status is still 'posted', and correct_je_id is STILL the
 * sole live JE referencing it (re-derived fresh, not trusted from the embedded snapshot) --
 * refuses per-row on any mismatch rather than guessing.
 *
 * Pure metadata: UPDATE accounting.expenses SET journal_entry_id = <correct live je id> only,
 * only on these 201 ids, only where the live re-check confirms it. No JE, no GL, no other column.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth166-backfill-201-expense-journal-entry-id-backlinks.ts [--apply]
 * (run from repo root; DRY RUN first with no --apply flag)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-166";

const TARGETS: { exp_id: string; correct_je_id: string; current_je_id: string | null }[] = JSON.parse(
  await (await import("node:fs")).promises.readFile(path.join(ROOT, "scripts/ops/2026-09-30-cc2-auth166-targets.json"), "utf8")
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (TARGETS.length !== 201) throw new Error(`expected 201 embedded targets, found ${TARGETS.length} -- refusing`);
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    let updated = 0;
    let skippedAlreadyCorrect = 0;
    for (const t of TARGETS) {
      const expRow = await client.query<{
        journal_entry_id: string | null; deleted_at: string | null; status: string; operating_company_id: string;
      }>(
        `SELECT journal_entry_id::text, deleted_at::text, status, operating_company_id::text
           FROM accounting.expenses WHERE id = $1::uuid`,
        [t.exp_id]
      );
      const e = expRow.rows[0];
      if (!e) throw new Error(`${t.exp_id}: expense row no longer exists -- refusing`);
      if (e.operating_company_id !== USMCA) throw new Error(`${t.exp_id}: not USMCA (${e.operating_company_id}) -- refusing`);
      if (e.deleted_at) throw new Error(`${t.exp_id}: soft-deleted since snapshot -- refusing`);
      if (e.status !== "posted") throw new Error(`${t.exp_id}: status is ${e.status}, not posted -- refusing`);

      // Re-derive live-JE-referencing-this-expense fresh -- must still be exactly one, and must
      // still be t.correct_je_id, before writing.
      const liveJes = await client.query<{ je_id: string }>(
        `SELECT DISTINCT jep.journal_entry_uuid::text AS je_id
           FROM accounting.journal_entry_postings jep
           JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
           JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE je.operating_company_id = $1::uuid AND je.status = 'posted' AND je.is_sample_data IS NOT TRUE
            AND je.reversed_by_je_id IS NULL AND je.reverses_je_id IS NULL
            AND jep.debit_or_credit = 'debit' AND a.account_number ~ '^(5|6)\\d{3}'
            AND jep.source_transaction_type = 'expense' AND jep.source_transaction_id::text = $2`,
        [USMCA, t.exp_id]
      );
      if (liveJes.rows.length !== 1) {
        throw new Error(`${t.exp_id}: expected exactly 1 live cost-debit JE, found ${liveJes.rows.length} (${JSON.stringify(liveJes.rows)}) -- refusing, re-verify (possible new duplicate)`);
      }
      if (liveJes.rows[0]!.je_id !== t.correct_je_id) {
        throw new Error(`${t.exp_id}: live JE is now ${liveJes.rows[0]!.je_id}, expected ${t.correct_je_id} -- refusing, state changed since snapshot`);
      }

      if (e.journal_entry_id === t.correct_je_id) {
        skippedAlreadyCorrect++;
        continue;
      }

      const upd = await client.query<{ id: string }>(
        `UPDATE accounting.expenses SET journal_entry_id = $1::uuid
           WHERE id = $2::uuid AND operating_company_id = $3::uuid AND deleted_at IS NULL
             AND journal_entry_id IS DISTINCT FROM $1::uuid
           RETURNING id::text`,
        [t.correct_je_id, t.exp_id, USMCA]
      );
      if (upd.rows.length !== 1) throw new Error(`${t.exp_id}: update affected ${upd.rows.length} rows, expected 1 -- refusing`);
      updated++;
    }
    console.log(`Preflight+write OK: ${updated} rows updated, ${skippedAlreadyCorrect} already correct (race with concurrent writer), ${TARGETS.length} total targets.`);

    if (APPLY) {
      await client.query("COMMIT");
      console.log("COMMITTED");
    } else {
      await client.query("ROLLBACK");
      console.log("DRY RUN — rolled back, nothing written");
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
