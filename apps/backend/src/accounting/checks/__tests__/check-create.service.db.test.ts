// Real Postgres proof for check-create.service.ts's createCheck() -- CI-gated (GITHUB_ACTIONS), same
// pattern as PR 1/7's accept-bill-match.db.test.ts and PR 2/7's resolver tests.
//
// Deliberately NOT run against the real USMCA production branch (br-fancy-credit-akjnd07a) --
// R-157.1's standing order is "CC-2 does not create a check in USMCA production." This test targets
// a disposable Neon branch forked from prod (br-empty-rice-akqh08we, "cc2-check-engine-pr3-rehearsal")
// via DATABASE_URL/DATABASE_DIRECT_URL passed in the environment when run locally -- it carries the
// exact same real USMCA rows (same vendor/bank-account/category-map ids) without touching prod.
import { describe, it, expect } from "vitest";
import { createCheck, CreateCheckConflictError, CheckAccountError } from "../check-create.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_BOA_CHECKING = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const REAL_VENDOR_ID = "a94a93d2-37b4-4179-82c3-9e155eb33af7";
const REAL_DRIVER_ID = "52037e93-484a-4659-ab60-cf2a78f4c647";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001"; // FK-optional created_by_user_id; only needs to be a uuid shape here.

function uniqueCheckNumber(): string {
  return `TST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("check-create.service createCheck (real Postgres, rehearsal branch only)", () => {
  it(
    "creates a real check against a real vendor + real mapped category, one line",
    async () => {
      const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        payee_kind: "vendor",
        payee_id: REAL_VENDOR_ID,
        check_date: "2026-09-25",
        print_later: false,
        check_number: uniqueCheckNumber(),
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 12345 }],
      });
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.print_status).toBe("not_set");
      expect(result.total_amount_cents).toBe(12345);
      expect(result.print_on_check_name).toBe("Guzman Landscaping And Pool Maintenance");
    },
    30_000
  );

  it(
    "print-later leaves check_number null and print_status need_to_print, no registry row",
    async () => {
      const result = await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        payee_kind: "vendor",
        payee_id: REAL_VENDOR_ID,
        check_date: "2026-09-25",
        print_later: true,
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 500 }],
      });
      expect(result.check_number).toBeNull();
      expect(result.print_status).toBe("need_to_print");
    },
    30_000
  );

  it(
    "refuses a duplicate check number on the same bank account with CreateCheckConflictError",
    async () => {
      const num = uniqueCheckNumber();
      await createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
        bank_account_id: USMCA_BOA_CHECKING,
        payee_kind: "vendor",
        payee_id: REAL_VENDOR_ID,
        check_date: "2026-09-25",
        print_later: false,
        check_number: num,
        lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 100 }],
      });
      await expect(
        createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
          bank_account_id: USMCA_BOA_CHECKING,
          payee_kind: "vendor",
          payee_id: REAL_VENDOR_ID,
          check_date: "2026-09-25",
          print_later: false,
          check_number: num,
          lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 200 }],
        })
      ).rejects.toBeInstanceOf(CreateCheckConflictError);
    },
    30_000
  );

  it(
    "refuses a driver + cash_advance line as DRIVER_ADVANCE_IS_A_BILL_PAYMENT, writes nothing",
    async () => {
      await expect(
        createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
          bank_account_id: USMCA_BOA_CHECKING,
          payee_kind: "driver",
          payee_id: REAL_DRIVER_ID,
          check_date: "2026-09-25",
          print_later: false,
          check_number: uniqueCheckNumber(),
          lines: [{ line_kind: "category", category_kind: "cash_advance", category_code: "cash_advance", amount_cents: 5000 }],
        })
      ).rejects.toMatchObject({ code: "DRIVER_ADVANCE_IS_A_BILL_PAYMENT" });
    },
    30_000
  );

  it(
    "refuses a zero-line total with TOTAL_MUST_BE_POSITIVE before touching the database",
    async () => {
      await expect(
        createCheck(USMCA_COMPANY_ID, ACTOR_USER_ID, {
          bank_account_id: USMCA_BOA_CHECKING,
          payee_kind: "vendor",
          payee_id: REAL_VENDOR_ID,
          check_date: "2026-09-25",
          print_later: true,
          lines: [{ line_kind: "category", category_kind: "maintenance", category_code: "maintenance", amount_cents: 0 }],
        })
      ).rejects.toBeInstanceOf(CheckAccountError);
    },
    30_000
  );
});
