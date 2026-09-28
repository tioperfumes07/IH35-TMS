#!/usr/bin/env npx tsx
/**
 * ROUND 206 item 1 — finish Check Creator print path (half-wired: registry had only
 * create-with-number voided rows; print batches = 0).
 * Flow: createCheck(print_later) → print-batch assign stock next → confirm → measure
 * registry/GL/print_status → voidCheck same session.
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

async function measure() {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const stock = await getCheckStockSettings(client, USMCA, BOA);
    const reg = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const batches = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM banking.check_print_batches WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    return {
      registry_count: Number(reg.rows[0]?.n ?? 0),
      print_batch_count: Number(batches.rows[0]?.n ?? 0),
      next_check_number: stock?.next_check_number ?? null,
    };
  });
}

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-122") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-122");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const before = await measure();
  console.log("REGISTRY_COUNT_BEFORE", before.registry_count);
  console.log("BEFORE", before);
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
    memo: `AUTH-122 R206 print-path proof — VOID same session`,
    lines: [
      {
        line_kind: "category",
        category_kind: "maintenance",
        category_code: "maintenance",
        amount_cents: 100,
        description: "AUTH-122 print-path $1.00",
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
    const reg = await client.query(
      `SELECT count(*)::int AS n FROM banking.check_number_registry WHERE operating_company_id = $1::uuid`,
      [USMCA]
    );
    const row = await client.query(
      `SELECT e.id::text, e.check_number, e.print_status, e.posting_status, e.journal_entry_id::text,
              r.status AS reg_status
         FROM accounting.expenses e
         LEFT JOIN banking.check_number_registry r ON r.source_id = e.id
        WHERE e.id = $1::uuid`,
      [created.id]
    );
    return { registry_count: Number(reg.rows[0].n), expense: row.rows[0] };
  });
  console.log("AFTER_PRINT", mid);
  if (mid.registry_count !== before.registry_count + 1) {
    console.error(`FAIL — registry expected ${before.registry_count + 1}, got ${mid.registry_count}`);
    process.exit(1);
  }
  if (mid.expense.print_status !== "print_complete") {
    console.error("FAIL — print_status not print_complete");
    process.exit(1);
  }
  if (mid.expense.posting_status !== "posted" || !mid.expense.journal_entry_id) {
    console.error("FAIL — GL not posted");
    process.exit(1);
  }

  const voided = await voidCheck(
    USMCA,
    ACTOR,
    created.id,
    "AUTH-122 R206 print-path proof — void same session"
  );
  console.log("VOIDED", voided);

  const after = await measure();
  console.log("REGISTRY_COUNT_AFTER", after.registry_count);
  console.log("AFTER_VOID", after);
  console.log(
    "PASS — creator→print→registry→GL→void. REGISTRY_COUNT_BEFORE=%s REGISTRY_COUNT_AFTER=%s",
    before.registry_count,
    after.registry_count
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
