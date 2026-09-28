// ROUND 144 (owner order) — concurrency proof for check-print-batch.service.ts's number assignment.
// Sequential correctness (check-print-batch.service.db.test.ts) is NOT the claim under test here.
// The claim is: `SELECT ... FOR UPDATE` on banking.check_stock_settings serializes two *separate*
// assignPrintBatch() calls racing on the SAME bank account, so neither can read the same
// next_check_number as the other. This test fires N concurrent calls (Promise.all, not sequential
// awaits) each assigning one check, and asserts the N returned numbers are exactly the expected
// contiguous run with no duplicate and no gap -- the only thing that actually proves the lock works
// under real concurrent load, as opposed to merely existing in the SQL text.
//
// CI-gated (GITHUB_ACTIONS), rehearsal Neon branch only (br-empty-rice-akqh08we,
// "cc2-check-engine-pr3-rehearsal") -- same rationale and same branch as the sibling PR 5/7 test in
// this directory. Never touches prod.
import { describe, expect, it } from "vitest";
import { withLuciaBypass } from "../../../auth/db.js";
import { createCheck } from "../check-create.service.js";
import { assignPrintBatch } from "../check-print-batch.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_BOA_CHECKING = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const REAL_VENDOR_ID = "a94a93d2-37b4-4179-82c3-9e155eb33af7";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const CONCURRENCY = 8;

async function seedPrintLaterCheck(amountCents: number): Promise<string> {
  const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
    bank_account_id: USMCA_BOA_CHECKING,
    payee_kind: "vendor",
    payee_id: REAL_VENDOR_ID,
    check_date: "2026-09-27",
    print_later: true,
    lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: amountCents }],
  });
  return result.id;
}

const describeDb = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeDb("check-print-batch.service concurrency (real Postgres, rehearsal branch only)", () => {
  it(
    `${CONCURRENCY} concurrent single-check print batches on the same bank account never double-issue or skip a number`,
    async () => {
      // Deterministic, re-runnable starting point -- unlike the sibling test's ON CONFLICT DO
      // NOTHING (which only seeds once), this always resets to a fresh known value so re-running
      // this file never collides with whatever number a prior run or the sibling suite left behind.
      const startNumber = 9001n + BigInt(Date.now() % 100000);
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_COMPANY_ID]);
        await client.query(
          `INSERT INTO banking.check_stock_settings (bank_account_id, operating_company_id, next_check_number, check_type)
           VALUES ($1::uuid, $2::uuid, $3::bigint, 'voucher')
           ON CONFLICT (bank_account_id) DO UPDATE SET next_check_number = EXCLUDED.next_check_number`,
          [USMCA_BOA_CHECKING, USMCA_COMPANY_ID, startNumber.toString()]
        );
      });

      const checkIds = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => seedPrintLaterCheck(500 + i)));

      // The race: N separate callers, each printing ONE check, all firing at once against the same
      // bank_account_id -- not one batch with N ids (that would take the lock once and never race).
      const results = await Promise.all(
        checkIds.map((id) =>
          assignPrintBatch(USMCA_COMPANY_ID, ACTOR_USER_ID, {
            bank_account_id: USMCA_BOA_CHECKING,
            check_type: "voucher",
            ids: [id],
          })
        )
      );

      const assignedNumbers = results.map((r) => BigInt(r.assignments[0].check_number));
      const uniqueNumbers = new Set(assignedNumbers.map((n) => n.toString()));
      expect(uniqueNumbers.size).toBe(CONCURRENCY); // no double-issue

      const sorted = [...assignedNumbers].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (let i = 0; i < CONCURRENCY; i++) {
        expect(sorted[i]).toBe(startNumber + BigInt(i)); // exactly contiguous, no skipped number
      }

      const finalNext = await withLuciaBypass(async (client) => {
        const res = await client.query(
          `SELECT next_check_number::text FROM banking.check_stock_settings WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid`,
          [USMCA_BOA_CHECKING, USMCA_COMPANY_ID]
        );
        return BigInt(res.rows[0].next_check_number);
      });
      expect(finalNext).toBe(startNumber + BigInt(CONCURRENCY)); // advanced by exactly N, not more/less

      // Every registry row that came out of the race is independently well-formed: distinct check
      // number, points back at the check that actually requested it, no cross-assignment.
      const registryRows = await withLuciaBypass(async (client) => {
        const res = await client.query(
          `SELECT check_number, source_id::text AS source_id FROM banking.check_number_registry
            WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid AND check_number = ANY($3::text[])`,
          [USMCA_COMPANY_ID, USMCA_BOA_CHECKING, assignedNumbers.map((n) => n.toString())]
        );
        return res.rows as Array<{ check_number: string; source_id: string }>;
      });
      expect(registryRows).toHaveLength(CONCURRENCY);
      for (const row of registryRows) {
        const expectedCheckId = results.find((r) => r.assignments[0].check_number === row.check_number)?.assignments[0].check_id;
        expect(row.source_id).toBe(expectedCheckId);
      }
    },
    60_000
  );
});
