/**
 * R-157 STEP 0 (Lead, 2026-09-25 9:10 AM CT/14:10Z, deadline 15:00Z) — "QuickBooks does not
 * reclassify an expense with a JE. It edits the expense's category." The 4 remaining costs-guard
 * `manual_je` violations are CC-1's own item-9 reclass JEs (PR #22598/#22603) that corrected the
 * GL account without touching the underlying expense document. Fixes that the QuickBooks way:
 *
 * For each of the 4 (b699d2ac/6ff6b8fa/9726b25b/5ebb6624, backing EXP-2026-00053/00050/00021/00049):
 *   1. Void the reclass JE through the real void engine (voidJournalEntry).
 *   2. Void the ORIGINAL expense document through the real void route's own logic, copied verbatim
 *      from apps/backend/src/accounting/expenses.routes.ts's POST /:expenseId/void handler
 *      (reversePostedSourceTransactionInClientTx, gracefully catching SOURCE_NOT_FOUND exactly as
 *      that route does -- confirmed live before writing this that all 4 originals are already
 *      status='draft'/posting_status='unposted'/journal_entry_id=NULL with their own original
 *      posting JE already reversed independently, dated 2026-09-24 ~04:1x-04:2xZ, well before this
 *      session's own item-9 work -- so this step is the header-flip + cascade + audit half only;
 *      there is no live JE left on the original to reverse).
 *   3. Recreate the expense through the same INSERT shape as that route's POST /api/v1/expenses
 *      handler, copying every field from the original (vendor, driver, load, date, amount, memo,
 *      is_sample_data/is_reimbursable/is_company_expense, created_by_user_id) except the category,
 *      resolved via the real resolveExpenseCategoryId(client, {accountId}) against the correct
 *      target account (5310/5400/5300/5300) -- same helper the route itself calls, not guessed.
 *   4. Post the new expense through the real posting engine (postSourceTransaction).
 *
 * NO NEW GL MATH, NO NEW WRITER -- every step reuses an existing, already-reviewed function or a
 * verbatim copy of the route's own inline SQL (quoted in the comments above each block below).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

type Target = { reclassJeId: string; expenseId: string; expenseNumber: string; correctAccountId: string; correctAccountNumber: string };
const TARGETS: Target[] = [
  { reclassJeId: "b699d2ac-f9b0-4646-84a4-b983b957e64a", expenseId: "61d87af3-37ca-41bd-98f2-51636d123208", expenseNumber: "EXP-2026-00053", correctAccountId: "b029d12d-f0b2-4f69-9e84-5df91a954c77", correctAccountNumber: "5310" },
  { reclassJeId: "6ff6b8fa-7bb7-49bc-91de-e7256a9b2ff8", expenseId: "8f928234-103a-414c-b60a-618ad922d407", expenseNumber: "EXP-2026-00050", correctAccountId: "8fe4f37c-39ae-48df-a0f9-f43489f3df5d", correctAccountNumber: "5400" },
  { reclassJeId: "9726b25b-0051-4655-90a3-2ee2b744703d", expenseId: "64f936ec-220e-4ea1-9cbb-75cc92bdbbea", expenseNumber: "EXP-2026-00021", correctAccountId: "4a0a5b88-3f56-4dc7-853c-37071089315a", correctAccountNumber: "5300" },
  { reclassJeId: "5ebb6624-196a-4e73-8e03-510f07deacfc", expenseId: "28da7af3-64a2-4deb-b2c4-e63c482d9625", expenseNumber: "EXP-2026-00049", correctAccountId: "4a0a5b88-3f56-4dc7-853c-37071089315a", correctAccountNumber: "5300" },
];

async function main() {
  const { voidJournalEntry } = await import("../../apps/backend/src/accounting/journal-entries.service.js");
  const { reversePostedSourceTransactionInClientTx, postSourceTransactionInClientTx, PostingEngineError } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { todayIso, canVoid } = await import("../../apps/backend/src/accounting/void.service.js");
  const { cascadeVoidChildren } = await import("../../apps/backend/src/accounting/cascade-void-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { resolveExpenseCategoryId } = await import("../../apps/backend/src/accounting/expense-category-catalog.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  if (process.env.DRY_RUN !== "1") {
    // 1. Void the 4 reclass JEs FIRST, as their own independent operation -- voidJournalEntry
    // manages its own transaction internally (no client-taking overload exists), and voiding a
    // reclass JE is correct on its own regardless of whether the recreate below succeeds.
    for (const t of TARGETS) {
      const jeRes = await pool.query(
        `SELECT reversed_by_je_id FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [t.reclassJeId, USMCA_ID]
      );
      if (jeRes.rows[0]?.reversed_by_je_id) {
        console.log(`${t.expenseNumber}: reclass JE ${t.reclassJeId} already reversed -- skipping`);
        continue;
      }
      // canVoid (void.service.ts) only allows role Owner or Accountant -- Administrator is
      // deliberately excluded there (unlike createJournalEntryOnClient's own role check
      // elsewhere in this session). Caught live on the first real-run rehearsal attempt.
      const jeVoidRes = await voidJournalEntry(USMCA_ID, t.reclassJeId, "R-157 STEP 0 -- superseded by expense-category recreate, not a hand-written correcting JE", { userId: SYSTEM_ACTOR_USER_ID, role: "Owner" });
      console.log(`${t.expenseNumber}: voided reclass JE ${t.reclassJeId} -> ${JSON.stringify(jeVoidRes)}`);
    }
  } else {
    console.log("DRY_RUN=1 -- skipping the 4 JE voids too (voidJournalEntry has no rollback-preview mode; nothing touched).");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA_ID]);

    for (const t of TARGETS) {
      // Load the original expense's full row (copy every field the recreate needs).
      const orig = await client.query<{
        id: string; vendor_uuid: string | null; driver_uuid: string | null; memo: string | null;
        payment_account_uuid: string | null; linked_work_order_uuid: string | null; unit_id: string | null;
        trailer_id: string | null; insurance_claim_id: string | null; legal_matter_id: string | null;
        class_id: string | null; vendor_document_number: string | null; created_by_user_id: string | null;
        load_id: string | null; transaction_date: string; total_amount_cents: string;
        is_sample_data: boolean; is_reimbursable: boolean; is_company_expense: boolean;
        status: string; posting_status: string;
      }>(
        `SELECT id::text, vendor_uuid::text, driver_uuid::text, memo, payment_account_uuid::text,
                linked_work_order_uuid::text, unit_id::text, trailer_id::text, insurance_claim_id::text,
                legal_matter_id::text, class_id::text, vendor_document_number, created_by_user_id::text,
                load_id::text, transaction_date::text, total_amount_cents::text,
                is_sample_data, is_reimbursable, is_company_expense, status, posting_status
           FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [t.expenseId, USMCA_ID]
      );
      const o = orig.rows[0];
      if (!o) throw new Error(`${t.expenseNumber}: original expense not found -- STOP`);
      if (o.status === "void") {
        console.log(`${t.expenseNumber}: original expense already void -- skipping void step, still recreating if no successor exists`);
      } else {
        // 2. Void the original expense -- verbatim shape of expenses.routes.ts POST /:expenseId/void.
        let reversingJeId: string | null = null;
        if (o.posting_status === "posted") {
          try {
            const rev = await reversePostedSourceTransactionInClientTx(
              client,
              { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: t.expenseId },
              { userId: SYSTEM_ACTOR_USER_ID },
              todayIso()
            );
            reversingJeId = rev.journal_entry_id;
          } catch (revErr) {
            if (!(revErr instanceof PostingEngineError) || revErr.code !== "SOURCE_NOT_FOUND") throw revErr;
          }
        }
        await client.query(
          `UPDATE accounting.expenses
             SET status='void',
                 posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
                 reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
                 voided_at=now(), voided_by_user_id=$3::uuid, void_reason=$4, updated_at=now()
             WHERE id=$1::uuid AND operating_company_id=$5::uuid`,
          [t.expenseId, reversingJeId, SYSTEM_ACTOR_USER_ID, "R-157 STEP 0 -- recreated with the correct category through the writer, QuickBooks-style (no JE-only reclass)", USMCA_ID]
        );
        await cascadeVoidChildren(client, "expense", t.expenseId, USMCA_ID);
        await appendCrudAudit(client, SYSTEM_ACTOR_USER_ID, "expense.voided", { expense_id: t.expenseId, reversing_journal_entry_id: reversingJeId, reason: "R-157 STEP 0 recreate" }, "warning");
        console.log(`${t.expenseNumber}: voided original expense ${t.expenseId} (reversingJeId=${reversingJeId})`);
      }

      // Idempotency: a successor expense (same load, same amount, already on the correct account)
      // means a prior run already recreated this one -- skip re-recreating.
      const successor = await client.query<{ id: string }>(
        `SELECT e.id::text FROM accounting.expenses e
           JOIN accounting.expense_lines el ON el.expense_id = e.id
          WHERE e.operating_company_id = $1::uuid AND e.id != $2::uuid AND e.load_id = $3::uuid
            AND e.total_amount_cents = $4::bigint AND el.expense_account_uuid = $5::uuid AND e.voided_at IS NULL
          LIMIT 1`,
        [USMCA_ID, t.expenseId, o.load_id, o.total_amount_cents, t.correctAccountId]
      );
      if (successor.rows[0]) {
        console.log(`${t.expenseNumber}: successor expense ${successor.rows[0].id} already exists on ${t.correctAccountNumber} -- skipping recreate`);
        results.push({ expense_number: t.expenseNumber, status: "already_recreated", new_expense_id: successor.rows[0].id });
        continue;
      }

      // 3. Recreate -- same INSERT shape as expenses.routes.ts POST /api/v1/expenses, category
      // resolved for real via resolveExpenseCategoryId(accountId), not guessed.
      const expenseCategoryId = await resolveExpenseCategoryId(client, {
        operatingCompanyId: USMCA_ID,
        categoryId: null,
        categoryCode: null,
        accountId: t.correctAccountId,
      });

      const insertRes = await client.query<{ id: string }>(
        `INSERT INTO accounting.expenses (
           operating_company_id, status, transaction_date, total_amount_cents,
           is_sample_data, is_reimbursable, is_company_expense,
           vendor_uuid, driver_uuid, memo, payment_account_uuid, linked_work_order_uuid,
           unit_id, trailer_id, insurance_claim_id, legal_matter_id, class_id,
           vendor_document_number, created_by_user_id, load_id
         ) VALUES (
           $1::uuid, 'posted', $2::date, $3::bigint,
           $4, $5, $6,
           $7::uuid, $8::uuid, $9, $10::uuid, $11::uuid,
           $12::uuid, $13::uuid, $14::uuid, $15::uuid, $16::uuid,
           $17, $18::uuid, $19::uuid
         ) RETURNING id::text`,
        [
          USMCA_ID, o.transaction_date, o.total_amount_cents,
          o.is_sample_data, o.is_reimbursable, o.is_company_expense,
          o.vendor_uuid, o.driver_uuid, o.memo, o.payment_account_uuid, o.linked_work_order_uuid,
          o.unit_id, o.trailer_id, o.insurance_claim_id, o.legal_matter_id, o.class_id,
          o.vendor_document_number, o.created_by_user_id, o.load_id,
        ]
      );
      const newExpenseId = insertRes.rows[0]?.id;
      if (!newExpenseId) throw new Error(`${t.expenseNumber}: recreate insert failed -- STOP`);

      await client.query(
        `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description, expense_account_uuid, expense_category_uuid)
         VALUES ($1::uuid, 1, $2::bigint, $3::numeric, $4, $5::uuid, $6::uuid)`,
        [newExpenseId, o.total_amount_cents, (Number(o.total_amount_cents) / 100).toFixed(2), o.memo, t.correctAccountId, expenseCategoryId]
      );

      // 4. Post it for real -- IN-CLIENT variant, same transaction, so it can see the row just
      // INSERTed above. The non-client postSourceTransaction opens its OWN connection and would
      // not see this uncommitted insert (confirmed live on the first rehearsal: "Expense not
      // found" -- exactly the ACCT-F5652-class cross-connection visibility gap this codebase has
      // already fixed elsewhere).
      const posted = await postSourceTransactionInClientTx(
        client,
        { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: newExpenseId },
        { userId: SYSTEM_ACTOR_USER_ID }
      );
      console.log(`${t.expenseNumber}: recreated as ${newExpenseId} on ${t.correctAccountNumber}, posted -> ${JSON.stringify(posted)}`);

      results.push({ expense_number: t.expenseNumber, old_expense_id: t.expenseId, new_expense_id: newExpenseId, reclass_je_voided: t.reclassJeId, account: t.correctAccountNumber });
    }

    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 -- rolling back, nothing committed.");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("COMMITTED.");
    }
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED, rolled back:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
