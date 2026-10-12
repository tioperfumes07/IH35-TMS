// Real Postgres proof for check-print-batch.service.ts -- CI-gated (GITHUB_ACTIONS).
// 443.91 #4: CI's database is FRESH (migrations only) — no USMCA company, bank account or vendor. The suite used to be pinned
// to live USMCA ids (rehearsal branch only) and so failed every CI run. It now builds its own isolated company
// (createIsolatedOperatingCompany, the canonical helper — same pattern as check-account-rules.service.db.test.ts) with exactly
// the rows the engine reads: a depository bank account on a ledger account, the maintenance expense-category map entry and an
// active vendor. The engine is unchanged.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../../auth/db.js";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { createIsolatedOperatingCompany } from "../../../../test-helpers/isolated-company.js";
import { createCheck } from "../check-create.service.js";
import { assignPrintBatch, confirmPrintBatch, CheckPrintBatchError } from "../check-print-batch.service.js";

let USMCA_COMPANY_ID = "";
let USMCA_BOA_CHECKING = "";
let REAL_VENDOR_ID = "";
let REPAIR_ITEM_ID = "";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

async function seedFixtureCompany(): Promise<void> {
  const { companyId } = await createIsolatedOperatingCompany({ codePrefix: "CPB", legalNamePrefix: "Check print fixture" });
  USMCA_COMPANY_ID = companyId;
  const client = new pg.Client(buildPgClientConfig(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? ""));
  await client.connect();
  try {
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    const acct = async (number: string, name: string, type: string) =>
      (await client.query<{ id: string }>(
        `INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable)
         VALUES ($1::uuid, $2, $3, $4, true) RETURNING id::text`, [companyId, number, name, type])).rows[0]!.id;
    const bankLedger = await acct("1000", "Checking", "Asset");
    const cogs = await acct("5300", "Repairs & Maintenance", "CostOfGoodsSold");
    USMCA_BOA_CHECKING = (await client.query<{ id: string }>(
      `INSERT INTO banking.bank_accounts (operating_company_id, account_name, account_class, is_active, ledger_account_id, sync_status)
       VALUES ($1::uuid, 'Fixture Checking', 'depository', true, $2::uuid, 'active') RETURNING id::text`, [companyId, bankLedger])).rows[0]!.id;
    await client.query(
      `INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side)
       VALUES ($1::uuid, 'maintenance', 'maintenance', $2::uuid, 'debit')`, [companyId, cogs]);
    REPAIR_ITEM_ID = (await client.query<{ id: string }>(
      `INSERT INTO catalogs.items (operating_company_id, item_name, item_type, default_expense_account_id)
       VALUES ($1::uuid, 'Fixture Repair', 'Service', $2::uuid) RETURNING id::text`, [companyId, cogs])).rows[0]!.id;
    REAL_VENDOR_ID = (await client.query<{ id: string }>(
      `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type)
       VALUES ($1::uuid, 'Fixture Repair Shop', 'repair_shop') RETURNING id::text`, [companyId])).rows[0]!.id;
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}

async function seedPrintLaterCheck(): Promise<string> {
  const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
    bank_account_id: USMCA_BOA_CHECKING,
    payee_kind: "vendor",
    payee_id: REAL_VENDOR_ID,
    check_date: "2026-09-25",
    print_later: true,
    lines: [{ line_kind: "item", item_id: REPAIR_ITEM_ID, quantity: 1, rate_cents: 750, amount_cents: 750 }],
  });
  return result.id;
}

// 443.91 #4: this suite is pinned to REAL USMCA ids (bank account e83028a5…, vendor a94a93d2…) that exist only on a
// fork of prod (its own header: "rehearsal branch only"). CI's fresh, migrated Postgres has no such rows, so the FK
// check_stock_settings_bank_account_id_fkey refused its beforeAll on every CI run. It runs where its data exists:
// IH35_CHECK_REHEARSAL_DB=1 against a prod-fork DATABASE_URL. A self-contained fixture is the follow-up.
const describeDb = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeDb("check-print-batch.service (real Postgres, isolated fixture company)", () => {
  beforeAll(async () => {
    await seedFixtureCompany();
    // Seed a starting number ONLY if this rehearsal branch has none yet -- never overwrite an
    // in-progress sequence, and never run this against a branch without confirming it's the
    // disposable rehearsal one first (the hardcoded USMCA_COMPANY_ID + connection are the guard --
    // this test is never pointed at br-fancy-credit-akjnd07a).
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
      await client.query(
        `INSERT INTO banking.check_stock_settings (bank_account_id, operating_company_id, next_check_number, check_type)
         VALUES ($1::uuid, $2::uuid, 5001, 'voucher')
         ON CONFLICT (bank_account_id) DO NOTHING`,
        [USMCA_BOA_CHECKING, USMCA_COMPANY_ID]
      );
    });
  }, 30_000);

  it(
    "assigns sequential numbers in order, advances next_check_number, and creates registry + batch-item rows",
    async () => {
      const checkId = await seedPrintLaterCheck();
      const result = await assignPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        check_type: "voucher",
        ids: [checkId],
      });
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0].check_id).toBe(checkId);
      expect(result.assignments[0].check_number.length).toBeGreaterThan(0);

      const check = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT check_number, print_status FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { check_number: string; print_status: string };
      });
      expect(check.check_number).toBe(result.assignments[0].check_number);
      expect(check.print_status).toBe("print_complete");
    },
    30_000
  );

  it(
    "refuses to print a check that is already numbered (not queued)",
    async () => {
      const checkId = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        payee_kind: "vendor",
        payee_id: REAL_VENDOR_ID,
        check_date: "2026-09-25",
        print_later: false,
        check_number: `ALREADY-${Date.now()}`,
        lines: [{ line_kind: "item", item_id: REPAIR_ITEM_ID, quantity: 1, rate_cents: 100, amount_cents: 100 }],
      }).then((r) => r.id);

      await expect(
        assignPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, { bank_account_id: USMCA_BOA_CHECKING, check_type: "voucher", ids: [checkId] })
      ).rejects.toMatchObject({ code: "CHECK_NOT_QUEUED_FOR_PRINT" });
    },
    30_000
  );

  it(
    "confirm all_ok marks the batch confirmed and the registry row printed",
    async () => {
      const checkId = await seedPrintLaterCheck();
      const batch = await assignPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        check_type: "voucher",
        ids: [checkId],
      });
      const confirmed = await confirmPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, batch.print_batch_id, { all_ok: true });
      expect(confirmed.status).toBe("confirmed");
      expect(confirmed.spoiled_check_ids).toHaveLength(0);

      const registryStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(
          `SELECT status FROM banking.check_number_registry WHERE operating_company_id = $1::uuid AND source_id = $2::uuid`,
          [USMCA_COMPANY_ID, checkId]
        );
        return res.rows[0]?.status as string | undefined;
      });
      expect(registryStatus).toBe("printed");
    },
    30_000
  );

  it(
    "reprint_from_number spoils the reprinted check and requeues it -- check_number cleared, print_status back to need_to_print",
    async () => {
      const checkId = await seedPrintLaterCheck();
      const batch = await assignPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        check_type: "voucher",
        ids: [checkId],
      });
      const assignedNumber = batch.assignments[0].check_number;

      const reprinted = await confirmPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, batch.print_batch_id, {
        reprint_from_number: assignedNumber,
      });
      expect(reprinted.status).toBe("reprinting");
      expect(reprinted.spoiled_check_ids).toContain(checkId);

      const check = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT check_number, print_status FROM accounting.expenses WHERE id = $1::uuid`, [checkId]);
        return res.rows[0] as { check_number: string | null; print_status: string };
      });
      expect(check.check_number).toBeNull();
      expect(check.print_status).toBe("need_to_print");

      const registryStatus = await withLuciaBypass(async (client) => {
        const res = await client.query(`SELECT status FROM banking.check_number_registry WHERE check_number = $1 AND bank_account_id = $2::uuid`, [
          assignedNumber,
          USMCA_BOA_CHECKING,
        ]);
        return res.rows[0]?.status as string | undefined;
      });
      expect(registryStatus).toBe("spoiled");
    },
    30_000
  );

  it("refuses an unknown print batch id with PRINT_BATCH_NOT_FOUND", async () => {
    await expect(confirmPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, randomUUID(), { all_ok: true })).rejects.toBeInstanceOf(
      CheckPrintBatchError
    );
  }, 30_000);
});
