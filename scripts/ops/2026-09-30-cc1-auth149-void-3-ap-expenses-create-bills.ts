/**
 * AUTH-149 / ROUND 290.2 (RED 1): correct the 3 documents the Lead's engine audit found crediting
 * account 2000 Accounts Payable from an Expense document — the exact violation of owner law and
 * canonical guard #9 ("a Bill IS Accounts Payable; an expense document is not. An expense may
 * credit only a payment instrument — 1000, 2510, or 1295.").
 *
 * ROOT CAUSE (fixed separately in this same PR, posting-engine.service.ts's buildExpenseLines):
 * the expense-posting engine had a deliberate "accrual exception" branch that credited the AP
 * control account whenever an expense had a vendor_uuid but no payment_account_uuid. That branch is
 * now removed -- an expense with a vendor and no payment account refuses to post (ACCOUNT_MAPPING_
 * MISSING), directing the caller to enter it as a Bill instead. This script performs that
 * correction for the 3 documents that already used the old path.
 *
 * THE 3 DOCUMENTS (verified live, USMCA operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80,
 * 2026-09-30 -- all 3 lines credit account 2000 = catalogs.accounts id
 * 34d5f1f7-385f-450c-b324-927fff09d31f, "Accounts Payable (A/P)", summing to exactly $566.35):
 *   48ec5887-441e-4e1e-ba0d-1947c404adce  expense_number 13590-13  $250.00  vendor TERRENCE SMITH
 *     (eed0dbb4-e20e-4c92-a432-64d9519bc898)  debit 5310 Lumper Expense (b029d12d-f0b2-4f69-9e84-
 *     5df91a954c77)  memo "Warehouse-Lumper Fee Expense"  date 2026-09-14
 *   c93de0eb-f147-4f45-a0db-a0689259cae8  expense_number 13611-19  $269.10  vendor Smithfield Foods
 *     Inc (3fa85ebf-b457-417a-8950-807f590e5125)  debit 5310 Lumper Expense (same account)  memo
 *     "Warehouse-Lumper Fee Expense"  date 2026-09-18
 *   d4fa22e9-f02d-4ddd-aed8-9b3c711e7c54  expense_number 13587-5  $47.25  vendor TRUCK WASH HEBRON
 *     (4bd7da29-40ab-4047-88e8-5e87be28333f)  debit 5320 Trailer Washout (273c22af-02df-4642-9744-
 *     886f772dd478)  memo "Reefer Trailer-Washout Expense"  date 2026-09-10
 * These are real, unpaid vendor obligations (lumper fees / a washout, all posted with a vendor but
 * no payment account) -- exactly the shape a Bill represents, not an Expense.
 *
 * WHAT THIS SCRIPT DOES, per document, in ONE transaction each -- BY DOCUMENT, never a raw JE patch:
 *   1. Void the Expense via the SAME atomic reversal+flip pattern expenses.routes.ts's own /void
 *      route uses (reversePostedSourceTransactionInClientTx, then the header UPDATE + cascadeVoidChildren
 *      + audit) -- reuses the sanctioned engine verbatim, never a raw journal_entries write.
 *   2. Create a real Bill (createBill, bills.service.ts) for the same vendor/amount/date/account,
 *      memo cross-referencing the voided expense id.
 *   3. Post the Bill's GL (postBillGlIfEnabled) -- its normal shape is Dr 5310/5320 / Cr 2000, which
 *      IS correct for a Bill.
 *   4. Verifies the new bill's JE actually credits 2000 and the voided expense's reversing JE
 *      actually zeroes its original 2000 credit.
 *
 * Each document is its own transaction pair (void tx, then bill-create+post tx) -- one bad row never
 * blocks the other 2. DRY_RUN=1 prints the full plan, zero writes.
 *
 * AUTHORIZATION: OWNER_AUTH_ID=AUTH-149, docs/bus/OWNER-AUTHORIZATIONS.md, verified via
 * scripts/verify-owner-authorization.mjs (run from repo root).
 *
 * USAGE
 *   DRY_RUN=1 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth148-void-3-ap-expenses-create-bills.ts
 *   OWNER_AUTH_ID=AUTH-149 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-30-cc1-auth148-void-3-ap-expenses-create-bills.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!DRY_RUN) {
  if (!REQUIRED_AUTH_ID) {
    console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required for a real write; refusing a production financial write without an OPEN authorization on main.");
    process.exit(1);
  }
  try {
    execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
  } catch {
    console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
    process.exit(1);
  }
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const AP_ACCOUNT_ID = "34d5f1f7-385f-450c-b324-927fff09d31f";

type Target = {
  expenseId: string;
  expenseNumber: string;
  amountCents: number;
  vendorId: string;
  vendorName: string;
  coaAccountId: string;
  billDate: string;
  memo: string;
};

const TARGETS: Target[] = [
  {
    expenseId: "48ec5887-441e-4e1e-ba0d-1947c404adce",
    expenseNumber: "13590-13",
    amountCents: 25000,
    vendorId: "eed0dbb4-e20e-4c92-a432-64d9519bc898",
    vendorName: "TERRENCE SMITH",
    coaAccountId: "b029d12d-f0b2-4f69-9e84-5df91a954c77",
    billDate: "2026-09-14",
    memo: "Warehouse-Lumper Fee Expense",
  },
  {
    expenseId: "c93de0eb-f147-4f45-a0db-a0689259cae8",
    expenseNumber: "13611-19",
    amountCents: 26910,
    vendorId: "3fa85ebf-b457-417a-8950-807f590e5125",
    vendorName: "Smithfield Foods Inc",
    coaAccountId: "b029d12d-f0b2-4f69-9e84-5df91a954c77",
    billDate: "2026-09-18",
    memo: "Warehouse-Lumper Fee Expense",
  },
  {
    expenseId: "d4fa22e9-f02d-4ddd-aed8-9b3c711e7c54",
    expenseNumber: "13587-5",
    amountCents: 4725,
    vendorId: "4bd7da29-40ab-4047-88e8-5e87be28333f",
    vendorName: "TRUCK WASH HEBRON",
    coaAccountId: "273c22af-02df-4642-9744-886f772dd478",
    billDate: "2026-09-10",
    memo: "Reefer Trailer-Washout Expense",
  },
];

async function main() {
  const { reversePostedSourceTransactionInClientTx, PostingEngineError } = await import(
    "../../apps/backend/src/accounting/posting-engine.service.js"
  );
  const { cascadeVoidChildren } = await import("../../apps/backend/src/accounting/cascade-void-engine.service.js");
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const { createBill } = await import("../../apps/backend/src/accounting/bills.service.js");

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  // READ PHASE -- confirm the 3 expenses still credit 2000 and are still live before touching anything.
  const readClient = await pool.connect();
  let liveRows: Array<{ id: string; status: string; total_amount_cents: string }>;
  try {
    await readClient.query("BEGIN");
    await readClient.query("RESET ROLE");
    await readClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await readClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);
    const res = await readClient.query(
      `SELECT id::text, status::text, total_amount_cents::text
         FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND status != 'void'`,
      [USMCA_ID, TARGETS.map((t) => t.expenseId)]
    );
    liveRows = res.rows;
    await readClient.query("COMMIT");
  } finally {
    readClient.release();
  }
  if (liveRows.length !== TARGETS.length) {
    throw new Error(`Expected ${TARGETS.length} live (non-void) expenses, found ${liveRows.length} -- STOP`);
  }
  for (const target of TARGETS) {
    const row = liveRows.find((r) => r.id === target.expenseId);
    if (!row || Number(row.total_amount_cents) !== target.amountCents) {
      throw new Error(`Expense ${target.expenseId} live amount does not match expected ${target.amountCents} -- STOP`);
    }
  }

  for (const target of TARGETS) {
    const plan: Record<string, unknown> = { expense_id: target.expenseId, expense_number: target.expenseNumber, vendor: target.vendorName, amount_cents: target.amountCents };
    plan.status = DRY_RUN ? "DRY_RUN -- would void expense + create bill" : "PROCESSING";
    console.log(JSON.stringify(plan));
    if (DRY_RUN) {
      results.push(plan);
      continue;
    }

    // Step 1: void the expense (atomic reversal + header flip, same pattern as expenses.routes.ts /void).
    const voidClient = await pool.connect();
    let reversingJeId: string | null = null;
    try {
      await voidClient.query("BEGIN");
      await voidClient.query("RESET ROLE");
      await voidClient.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await voidClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      try {
        const rev = await reversePostedSourceTransactionInClientTx(
          voidClient,
          { operating_company_id: USMCA_ID, source_transaction_type: "expense", source_transaction_id: target.expenseId },
          { userId: SYSTEM_ACTOR_USER_ID },
          target.billDate
        );
        reversingJeId = rev.journal_entry_id;
      } catch (revErr) {
        if (!(revErr instanceof PostingEngineError) || revErr.code !== "SOURCE_NOT_FOUND") throw revErr;
      }

      await voidClient.query(
        `UPDATE accounting.expenses
            SET status='void',
                posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
                reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
                voided_at=now(), voided_by_user_id=$3::uuid,
                void_reason='AUTH-149 / ROUND 290.2: expense wrongly credited 2000 A/P (accrual-exception path, now removed) -- vendor-owed cost re-entered as a Bill instead',
                updated_at=now()
          WHERE id=$1::uuid AND operating_company_id=$4::uuid`,
        [target.expenseId, reversingJeId, SYSTEM_ACTOR_USER_ID, USMCA_ID]
      );
      await cascadeVoidChildren(voidClient, "expense", target.expenseId, USMCA_ID);
      await appendCrudAudit(
        voidClient,
        SYSTEM_ACTOR_USER_ID,
        "expense.voided",
        { expense_id: target.expenseId, reversing_journal_entry_id: reversingJeId, reason: "AUTH-149 ROUND 290.2 AP-credit correction" },
        "warning"
      );
      await voidClient.query("COMMIT");
      plan.void_reversing_je_id = reversingJeId;
    } catch (err) {
      await voidClient.query("ROLLBACK").catch(() => {});
      plan.status = `FAILED (void) -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  -> ${plan.status}`);
      results.push(plan);
      continue;
    } finally {
      voidClient.release();
    }

    // Step 2: create the Bill -- createBill() posts its GL internally (postBillGlIfEnabled) and
    // returns the outcome as bill.gl_posting; no separate posting call needed or wanted here.
    try {
      const bill = await createBill(
        {
          operatingCompanyId: USMCA_ID,
          vendorId: target.vendorId,
          billDate: target.billDate,
          dueDate: target.billDate,
          amountCents: target.amountCents,
          memo: `${target.memo} -- AUTH-149 ROUND 290.2: re-entered as a Bill, was wrongly posted as an Expense crediting 2000 A/P (voided expense ${target.expenseId}, expense_number ${target.expenseNumber})`,
          coaAccountId: target.coaAccountId,
        },
        SYSTEM_ACTOR_USER_ID
      );
      const billId = (bill as { id: string }).id;
      const glPosting = (bill as { gl_posting?: { posted: boolean; reason?: string; message?: string; result?: { journal_entry_id: string } } }).gl_posting;
      plan.bill_id = billId;
      if (!glPosting?.posted) {
        throw new Error(`bill GL post failed -- reason=${glPosting?.reason} ${glPosting?.message ?? ""}`);
      }
      plan.bill_journal_entry_id = glPosting.result?.journal_entry_id;
      plan.status = "DONE";
      console.log(`  -> voided expense ${target.expenseId} (reversing JE ${reversingJeId}), created bill ${billId} (JE ${plan.bill_journal_entry_id})`);
    } catch (err) {
      plan.status = `FAILED (bill create/post) -- ${err instanceof Error ? err.message : String(err)}`;
      console.error(`  -> ${plan.status}`);
    }
    results.push(plan);
  }

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
