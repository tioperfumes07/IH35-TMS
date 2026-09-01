import { describe, expect, it, vi } from "vitest";

import { nextCashAdvanceRequestDisplayId } from "../cash-advance-requests.service.js";

// ACCT-F19367 (board: CASH-ADVANCE-REQUEST-DISPLAY-ID-UNPROTECTED-RACE) -- this generator (the
// driver_finance.cash_advance_requests "CA-" series -- a SEPARATE table+series from
// cash-advances/display-id.ts's driver_finance.driver_advances "CA-" series, same prefix,
// different table) must acquire pg_advisory_xact_lock BEFORE the MAX(display_id)+1 read, so two
// concurrent submissions in the same (company, year) window serialize instead of racing on a
// bare read-then-write and colliding against the real unique index
// (cash_advance_requests_operating_company_id_display_id_key). Mirrors
// cash-advances/__tests__/display-id-advisory-lock.test.ts's own H6-2 pattern.

const OPCO = "11111111-1111-4111-8111-111111111111";

describe("nextCashAdvanceRequestDisplayId — advisory lock (ACCT-F19367)", () => {
  it("acquires the advisory lock BEFORE running the MAX(display_id) read", async () => {
    const order: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          order.push("lock");
          return { rows: [{ pg_advisory_xact_lock: "" }] };
        }
        if (sql.includes("MAX(")) {
          order.push("max");
          return { rows: [{ next_n: 1 }] };
        }
        return { rows: [] };
      }),
    };

    const id = await nextCashAdvanceRequestDisplayId(client as never, OPCO);

    const year = new Date().getUTCFullYear();
    expect(id).toBe(`CA-${year}-0001`);
    expect(order).toEqual(["lock", "max"]);
    expect(order.indexOf("lock")).toBeLessThan(order.indexOf("max"));
  });

  it("locks on a stable per-(company, year) key, not a global or per-call key", async () => {
    let lockKey: unknown = null;
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes("pg_advisory_xact_lock")) {
          lockKey = params[0];
          return { rows: [{ pg_advisory_xact_lock: "" }] };
        }
        return { rows: [{ next_n: 1 }] };
      }),
    };

    await nextCashAdvanceRequestDisplayId(client as never, OPCO);

    const year = new Date().getUTCFullYear();
    expect(typeof lockKey).toBe("string");
    expect(lockKey as string).toContain(OPCO);
    expect(lockKey as string).toContain(String(year));
  });
});
