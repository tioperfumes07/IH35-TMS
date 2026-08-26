/**
 * PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE — post the existing stuck TEST expense
 * 57cabbab-f06a-4fa3-ad67-877eb2e64b0f (USMCA) through the SAME supported path the app itself
 * exposes at POST /api/v1/expenses/:expenseId/post (apps/backend/src/accounting/expenses.routes.ts),
 * reusing the existing GL poster (postSourceTransaction) — no new GL math, no new posting logic.
 *
 * Root cause (verified live on Neon prod, br-fancy-credit-akjnd07a): this expense was created via
 * the maintenance work-order path (autoCreateExpenseFromWO, two-section-service.ts) with no
 * paymentAccountUuid resolved for WO 850e2cc4-1578-40c2-b38d-a528f7ea821d. That writer hardcodes
 * status='posted' on every WO-derived expense unconditionally, but only attempts GL posting
 * `if (paymentAccountUuid)` — so when no payment account is chosen, the row is inserted already
 * showing status=posted while posting_status stays 'unposted' forever, with no automatic retry and
 * no UI surfacing that GL posting was skipped entirely (not attempted, not failed).
 *
 * This expense HAS a vendor (LOVES TRAVEL STOPS) — so the canonical /:id/post route's own orphan
 * guard (`!payment_account_uuid && !vendor_uuid`) does not block it; the poster resolves the
 * missing cash leg to A/P for the known vendor, same as any vendor-billed expense with no payment
 * account chosen yet. No payment account is invented here; the poster's existing vendor-payable
 * fallback is what "reuse the poster" means.
 *
 * This script performs EXACTLY the 3 steps the route performs (Step A precheck, Step B post via
 * postSourceTransaction, Step C flip header + audit) — it is not a new posting path, just the same
 * route logic invoked directly against Neon prod since this fix has no browser session attached.
 *
 * Default mode = dry-run (Step A precheck only, zero writes). --commit runs Step B + Step C.
 *
 * Usage:
 *   DATABASE_URL=<direct> DATABASE_DIRECT_URL=<direct> npx tsx scripts/run-acct-expense-57cabbab-post-once.mts [--commit]
 */
import { withCompanyScope } from "../apps/backend/src/accounting/shared.ts";
import { postSourceTransaction, PostingEngineError } from "../apps/backend/src/accounting/posting-engine.service.ts";
import { isEnabled } from "../apps/backend/src/lib/feature-flags/service.ts";
import { appendCrudAudit } from "../apps/backend/src/audit/crud-audit.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const EXPENSE_ID = "57cabbab-f06a-4fa3-ad67-877eb2e64b0f";
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // Owner role, USMCA-accessible, same actor as created_by_user_id on this row
const EXPENSE_GL_POSTING_FLAG_KEY = "EXPENSE_GL_POSTING_ENABLED";
const COMMIT = process.argv.includes("--commit");

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL required");
if (/-pooler\./.test(url)) throw new Error("REFUSING -pooler: session GUCs do not survive transaction pooling under FORCE RLS");

// Step A (own tx): flag + eligibility — identical predicate set to the route's Step A.
const pre = await withCompanyScope(ACTOR_USER_ID, USMCA, async (client) => {
  if (!(await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: USMCA, user_uuid: ACTOR_USER_ID }))) {
    return { kind: "disabled" as const };
  }
  const r = await client.query(
    `SELECT e.posting_status, e.status, e.total_amount_cents::text, e.payment_account_uuid::text, e.vendor_uuid::text,
            (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::int AS line_count
       FROM accounting.expenses e WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid LIMIT 1`,
    [EXPENSE_ID, USMCA]
  );
  const exp = r.rows[0] as
    | { posting_status: string; status: string; total_amount_cents: string; payment_account_uuid: string | null; vendor_uuid: string | null; line_count: number }
    | undefined;
  if (!exp) return { kind: "not_found" as const };
  if (exp.status === "void") return { kind: "not_eligible" as const };
  if (exp.posting_status !== "unposted") return { kind: "already_posted" as const, exp };
  if (!exp.payment_account_uuid && !exp.vendor_uuid) return { kind: "orphan" as const };
  return { kind: "ok" as const, exp };
});

console.log("STEP A (precheck):", JSON.stringify(pre, null, 2));
if (pre.kind !== "ok") {
  console.log(COMMIT ? "Aborting --commit: precheck did not return ok." : "Dry-run precheck complete.");
  process.exit(pre.kind === "ok" ? 0 : 1);
}
if (!COMMIT) {
  console.log("Dry-run only (no --commit passed) — stopping before Step B/C.");
  process.exit(0);
}

// Step B: post the balanced JE via the EXISTING poster (own tx, idempotent — re-post returns the
// existing batch). Same call shape as the route.
let journalEntryId: string;
try {
  const posting = await postSourceTransaction(
    { operating_company_id: USMCA, source_transaction_type: "expense", source_transaction_id: EXPENSE_ID },
    { userId: ACTOR_USER_ID }
  );
  journalEntryId = posting.journal_entry_id;
} catch (err) {
  if (err instanceof PostingEngineError) {
    console.error(`PostingEngineError ${err.code}: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

// Step C: flip the header to posted — identical to the route's Step C.
await withCompanyScope(ACTOR_USER_ID, USMCA, async (client) => {
  await client.query(
    `UPDATE accounting.expenses
        SET posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
      WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
    [EXPENSE_ID, journalEntryId, USMCA]
  );
  await appendCrudAudit(client, ACTOR_USER_ID, "expense.posted", { expense_id: EXPENSE_ID, journal_entry_id: journalEntryId, source: "run-acct-expense-57cabbab-post-once" }, "info");
});

console.log(JSON.stringify({ expense_id: EXPENSE_ID, posting_status: "posted", journal_entry_id: journalEntryId }, null, 2));
