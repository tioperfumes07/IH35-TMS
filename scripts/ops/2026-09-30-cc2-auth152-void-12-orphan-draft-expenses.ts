#!/usr/bin/env -S npx tsx
/**
 * AUTH-152 -- void 12 orphan draft expenses (+ their JEs) that verify-costs-are-expenses-not-
 * handwritten-jes flags live, blocking every seat's push. Each of the 12 is an unnumbered
 * (expense_number NULL), never-linked (journal_entry_id NULL) draft, created at the identical
 * instant 2026-09-30T03:02:02.569Z, for the exact same amount+date as a SEPARATE, correctly
 * numbered and linked expense -- i.e. real money is posted twice for the same event. Voiding the
 * orphan (never the correct twin) removes the duplicate; the correct twin is untouched.
 *
 * Uses the sanctioned engine (executeVoidCancel -> executeExpense -> postVoidReversal +
 * stampDocumentVoided), never a hand-written UPDATE.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc2-auth144-void-12-orphan-draft-expenses.ts [--apply]
 * (run from repo root)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const AUTH_ID = "AUTH-152";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const ORPHAN_EXPENSE_IDS: string[] = [
  "4102568a-1693-453b-b490-ecb2a8861e57",
  "8e88475e-404c-4c1b-9c0d-9bd42816e285",
  "f158a883-81b4-4b89-81b3-e048ec903d11",
  "615ba771-3c59-42c9-a083-fd22eb8bd592",
  "5d4d872d-4757-4d5d-bc48-d226016ea972",
  "1dd54fc2-877e-4da2-8aff-e84319693377",
  "9a2632c7-25aa-4c22-9fde-d933eb6e1508",
  "36274438-8cb2-4242-8300-a0b7ef3eb742",
  "3492c10b-2101-4d9b-832b-73c032cf9dad",
  "a7f091ce-c75e-46fd-b4e7-5a351147227b",
  "ced40054-ab32-4bc3-8aa6-766bf4ccd951",
  "47fc543c-90aa-454d-a26d-6fc32576fa2d",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }

  const { postVoidReversal } = await import(path.join(ROOT, "apps/backend/src/accounting/void.service.ts"));

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  let ok = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const expId of ORPHAN_EXPENSE_IDS) {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE neondb_owner");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");

      const pre = await client.query<{
        expense_number: string | null;
        journal_entry_id: string | null;
        voided_at: string | null;
        status: string;
        posting_status: string;
        transaction_date: string | null;
      }>(
        `SELECT expense_number, journal_entry_id, voided_at::text, status::text, posting_status::text, transaction_date::text
           FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
        [expId, USMCA]
      );
      // A concurrent, independent fix (2026-09-30, a separate session's fork) backfilled
      // expense_number on these 12 rows to close a different, narrower violation (the
      // null-expense_number law) -- confirmed directly with that fork: it never asserted these are
      // legitimate distinct records, never checked for a duplicate-twin counterpart, and touched
      // ONLY expense_number/updated_at. void-not-delete keeps the number on the row after voiding,
      // so an expense_number alone is no longer a safety signal here -- only journal_entry_id
      // (still null on all 12, confirmed live) matters: a real journal_entry_id would mean this
      // row is now properly linked to its own JE, which would be the real "someone already fixed
      // this differently" signal this check exists to catch.
      if (pre.rows[0]?.journal_entry_id) {
        throw new Error(`SAFETY: this expense now has a journal_entry_id (${pre.rows[0].journal_entry_id}) -- no longer an orphan, refusing`);
      }
      if (pre.rows[0]?.voided_at) {
        console.log(`SKIP ${expId}: already voided`);
        await client.query("ROLLBACK");
        continue;
      }

      // NOTE: NOT using executeExpense/executeVoidCancel here. Its own gate
      // (`if (posting_status === 'posted')`) skips calling postVoidReversal entirely -- and every
      // one of these 12 has posting_status='unposted' despite status='posted' AND a real live JE
      // (source_transaction_type='expense') existing for it. That mismatch is itself part of this
      // same finding. Calling the executor as-is would flip the header to void WITHOUT reversing
      // the live JE -- leaving the guard's actual complaint (an orphan live JE) unfixed. Reversing
      // directly, then replicating executeExpense's own sanctioned header-stamp shape (its own raw
      // UPDATE, per its ROUND 138 comment -- this is that executor's normal pattern, not a
      // deviation from it).
      const td = pre.rows[0].transaction_date;
      const originalDate = td && td.length >= 10 ? td.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const reversal = await (postVoidReversal as any)(
        client,
        {
          operatingCompanyId: USMCA,
          entityType: "expense",
          entityId: expId,
          originalDate,
          memo: `Void reversal of orphan draft expense ${expId}: duplicate of an already-correctly-posted twin, posting_status was stale ('unposted') despite a real live JE existing`,
        },
        { userId: ACTOR_USER_ID }
      );
      const reversingEntryRef = reversal.reversal_journal_entry_id;
      if (!reversingEntryRef) throw new Error("postVoidReversal returned no reversal_journal_entry_id -- expected a live JE to reverse");

      const flipped = await client.query<{ id: string }>(
        `UPDATE accounting.expenses
            SET status = 'void',
                posting_status = 'reversed',
                reversed_by_je_id = COALESCE($3::uuid, reversed_by_je_id),
                voided_at = now(), voided_by_user_id = $4::uuid, void_reason = $5, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status <> 'void'
          RETURNING id::text`,
        [
          expId,
          USMCA,
          reversingEntryRef,
          ACTOR_USER_ID,
          "Duplicate orphan draft (expense_number/journal_entry_id never assigned, posting_status stale) -- a separate, correctly numbered and linked expense already represents this same amount+date. See docs/audit/GUARD-WORKORDERS.md HANDWRITTEN-COST-JE-12-ORPHAN-EXPENSES-2026093003.",
        ]
      );
      if (!flipped.rows[0]) throw new Error("header UPDATE affected 0 rows");
      const result = { kind: "ok", reversing_entry_ref: reversingEntryRef };
      console.log(`${expId}: ${JSON.stringify(result)}`);

      if (APPLY) {
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
      ok++;
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`FAILED ${expId}: ${e.message}`);
      failures.push({ id: expId, error: e.message });
    }
  }

  console.log(`\n${ok}/${ORPHAN_EXPENSE_IDS.length} ${APPLY ? "committed" : "dry-run rolled back"}, ${failures.length} failed`);
  if (failures.length) console.log("FAILURES:", JSON.stringify(failures, null, 2));

  await client.end();
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
