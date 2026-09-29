#!/usr/bin/env npx tsx
/**
 * ROUND 224 — Check Creator full chain proof after HTTP mount (AUTH-126).
 * Flow: measure BEFORE → createCheck(print_later) → assignPrintBatch (stock next) →
 * confirmPrintBatch → measure MID (live check + registry + JE + print_status) →
 * voidCheck same session → measure AFTER.
 * Seat-fixtures law: never leave a live unvoided check in USMCA.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCheck } from "../../apps/backend/src/accounting/checks/check-create.service.js";
import { assignPrintBatch, confirmPrintBatch } from "../../apps/backend/src/accounting/checks/check-print-batch.service.js";
import { voidCheck } from "../../apps/backend/src/accounting/checks/check-void.service.js";
import { getCheckStockSettings } from "../../apps/backend/src/accounting/checks/check-stock.service.js";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BOA = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const VENDOR = "b60c51c5-1e5f-43a6-a960-044a5ca6138f";
const ACTOR = "86e1e31f-c7b6-4427-bca6-40c5c4cff6d8";

type Counts = {
  registry_count: number;
  check_expense_all: number;
  check_expense_live: number;
  check_expense_live_with_number: number;
  check_expense_live_print_complete: number;
  check_expense_live_posted: number;
  next_check_number: string | null;
};

async function measure(): Promise<Counts> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const stock = await getCheckStockSettings(client, USMCA, BOA);
    const q = async (sql: string) => {
      const r = await client.query<{ n: number }>(sql, [USMCA]);
      return Number(r.rows[0]?.n ?? 0);
    };
    return {
      registry_count: await q(
        `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid`
      ),
      check_expense_all: await q(
        `SELECT count(*)::int AS n FROM accounting.expenses WHERE operating_company_id = $1::uuid AND payment_type = 'check'`
      ),
      check_expense_live: await q(
        `SELECT count(*)::int AS n FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND payment_type = 'check'
            AND status <> 'void' AND voided_at IS NULL`
      ),
      check_expense_live_with_number: await q(
        `SELECT count(*)::int AS n FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND payment_type = 'check'
            AND status <> 'void' AND voided_at IS NULL AND check_number IS NOT NULL`
      ),
      check_expense_live_print_complete: await q(
        `SELECT count(*)::int AS n FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND payment_type = 'check'
            AND status <> 'void' AND voided_at IS NULL AND print_status = 'print_complete'`
      ),
      check_expense_live_posted: await q(
        `SELECT count(*)::int AS n FROM accounting.expenses
          WHERE operating_company_id = $1::uuid AND payment_type = 'check'
            AND status <> 'void' AND voided_at IS NULL AND posting_status = 'posted'`
      ),
      next_check_number: stock?.next_check_number ?? null,
    };
  });
}

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-125") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-125");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const before = await measure();
  console.log("BEFORE", before);
  console.log("REGISTRY_COUNT_BEFORE", before.registry_count);
  console.log("CHECK_EXPENSE_LIVE_BEFORE", before.check_expense_live);
  if (!before.next_check_number || !/^\d+$/.test(String(before.next_check_number))) {
    console.error("FAIL — stock next_check_number missing; owner must type starting number");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const created = await createCheck(USMCA, ACTOR, {
    bank_account_id: BOA,
    payee_kind: "vendor",
    payee_id: VENDOR,
    check_date: today,
    print_later: true,
    memo: `AUTH-125 R222 full-chain proof — VOID same session`,
    lines: [
      {
        line_kind: "category",
        category_kind: "maintenance",
        category_code: "maintenance",
        amount_cents: 100,
        description: "AUTH-125 R222 chain $1.00",
      },
    ],
  });
  console.log("CREATED", {
    id: created.id,
    check_number: created.check_number,
    print_status: created.print_status,
    posting_status: created.posting_status,
    journal_entry_id: created.journal_entry_id,
  });
  if (created.print_status !== "need_to_print") {
    console.error("FAIL — expected need_to_print");
    process.exit(1);
  }
  if (created.posting_status !== "posted" || !created.journal_entry_id) {
    console.error("FAIL — GL not posted at create");
    process.exit(1);
  }

  const batch = await assignPrintBatch(USMCA, ACTOR, {
    bank_account_id: BOA,
    check_type: "voucher",
    ids: [created.id],
  });
  console.log("PRINT_BATCH", batch);
  const confirmed = await confirmPrintBatch(USMCA, ACTOR, batch.print_batch_id, { all_ok: true });
  console.log("CONFIRMED", confirmed);

  const mid = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const counts = await measure();
    const row = await client.query(
      `SELECT e.id::text, e.check_number, e.print_status, e.posting_status, e.journal_entry_id::text,
              e.payment_type, e.status, r.status AS reg_status, r.check_number AS reg_number
         FROM accounting.expenses e
         LEFT JOIN banking.check_number_registry r
           ON r.source_id = e.id AND r.source_kind = 'check'
        WHERE e.id = $1::uuid`,
      [created.id]
    );
    return { counts, expense: row.rows[0] };
  });
  console.log("MID_AFTER_PRINT", mid);
  console.log("REGISTRY_COUNT_MID", mid.counts.registry_count);
  console.log("CHECK_EXPENSE_LIVE_MID", mid.counts.check_expense_live);

  if (mid.counts.registry_count !== before.registry_count + 1) {
    console.error(`FAIL — registry expected ${before.registry_count + 1}, got ${mid.counts.registry_count}`);
    process.exit(1);
  }
  if (mid.counts.check_expense_live !== 1) {
    console.error(`FAIL — live check expenses expected 1, got ${mid.counts.check_expense_live}`);
    process.exit(1);
  }
  if (mid.expense.print_status !== "print_complete" || !mid.expense.check_number) {
    console.error("FAIL — print_status/check_number not set after print");
    process.exit(1);
  }
  if (mid.expense.payment_type !== "check" || mid.expense.posting_status !== "posted") {
    console.error("FAIL — payment_type/posting_status wrong at mid");
    process.exit(1);
  }

  const voided = await voidCheck(
    USMCA,
    ACTOR,
    created.id,
    "AUTH-125 R222 full-chain proof — void same session"
  );
  console.log("VOIDED", voided);

  const after = await measure();
  console.log("AFTER_VOID", after);
  console.log("REGISTRY_COUNT_AFTER", after.registry_count);
  console.log("CHECK_EXPENSE_LIVE_AFTER", after.check_expense_live);
  console.log(
    "PASS — creator→registry→expense(check)→GL→print→void. BEFORE registry=%s live=%s · MID registry=%s live=%s check#=%s · AFTER registry=%s live=%s",
    before.registry_count,
    before.check_expense_live,
    mid.counts.registry_count,
    mid.counts.check_expense_live,
    mid.expense.check_number,
    after.registry_count,
    after.check_expense_live
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
