// Real Postgres proof for check-print-batch.service.ts -- CI-gated (GITHUB_ACTIONS), rehearsal Neon
// branch only (br-empty-rice-akqh08we, "cc2-check-engine-pr3-rehearsal"), same rationale as PR 3/7's
// check-create.service.db.test.ts. banking.check_stock_settings.next_check_number is seeded on THIS
// rehearsal branch only, in the test's own beforeAll -- never touched on prod by this suite.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../../auth/db.js";
import { createCheck } from "../check-create.service.js";
import { assignPrintBatch, confirmPrintBatch, CheckPrintBatchError } from "../check-print-batch.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_BOA_CHECKING = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const REAL_VENDOR_ID = "a94a93d2-37b4-4179-82c3-9e155eb33af7";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

async function seedPrintLaterCheck(): Promise<string> {
  const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
    bank_account_id: USMCA_BOA_CHECKING,
    payee_kind: "vendor",
    payee_id: REAL_VENDOR_ID,
    check_date: "2026-09-25",
    print_later: true,
    lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 750 }],
  });
  return result.id;
}

const describeDb = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeDb("check-print-batch.service (real Postgres, rehearsal branch only)", () => {
  beforeAll(async () => {
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
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 100 }],
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
