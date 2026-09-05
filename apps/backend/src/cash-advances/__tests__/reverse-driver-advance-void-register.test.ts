import { describe, expect, it } from "vitest";
import { reverseDriverAdvanceInClientTx } from "../cash-advance-create.js";

// ACCT-SETL-ADV-VOID-GAP — reverseDriverAdvanceInClientTx is the only real "undo an advance" action
// in the codebase (PATCH /api/v1/cash-advances/:id/reverse, plus the load-cancellation cascade), and
// it predates GO-22's void register (voided_at/void_reason/voided_by_user_id, migration 202613490001).
// This asserts it now stamps that register on BOTH driver_advances and driver_liabilities, alongside
// the pre-existing disbursement_status='reversed' / current_balance=0 signals it already wrote — not a
// new action, the SAME action now also recording to the newer, standard columns.
describe("reverseDriverAdvanceInClientTx — ACCT-SETL-ADV-VOID-GAP", () => {
  function mockClient() {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    return {
      calls,
      query: async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    };
  }

  const ADVANCE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LIABILITY_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const ACTOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const COMPANY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const REASON = "Advance reversed";

  it("stamps voided_at/void_reason/voided_by_user_id on driver_advances alongside disbursement_status", async () => {
    const client = mockClient();
    await reverseDriverAdvanceInClientTx(client, ACTOR, COMPANY, {
      advanceId: ADVANCE_ID,
      liabilityId: null,
      reason: REASON,
    });
    const advanceUpdate = client.calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_advances"));
    expect(advanceUpdate, "driver_advances UPDATE not found").toBeTruthy();
    expect(advanceUpdate!.sql).toMatch(/disbursement_status\s*=\s*'reversed'/);
    expect(advanceUpdate!.sql).toMatch(/voided_at\s*=\s*COALESCE\(voided_at,\s*now\(\)\)/);
    expect(advanceUpdate!.sql).toMatch(/void_reason\s*=\s*COALESCE\(void_reason,\s*\$2\)/);
    expect(advanceUpdate!.sql).toMatch(/voided_by_user_id\s*=\s*COALESCE\(voided_by_user_id,\s*\$3::uuid\)/);
    expect(advanceUpdate!.values).toEqual([ADVANCE_ID, REASON, ACTOR]);
  });

  it("stamps the same register on driver_liabilities when a liabilityId is given, alongside the existing balance zero-out", async () => {
    const client = mockClient();
    await reverseDriverAdvanceInClientTx(client, ACTOR, COMPANY, {
      advanceId: ADVANCE_ID,
      liabilityId: LIABILITY_ID,
      reason: REASON,
    });
    const liabilityUpdate = client.calls.find((c) => c.sql.includes("UPDATE driver_finance.driver_liabilities"));
    expect(liabilityUpdate, "driver_liabilities UPDATE not found").toBeTruthy();
    expect(liabilityUpdate!.sql).toMatch(/current_balance\s*=\s*0/);
    expect(liabilityUpdate!.sql).toMatch(/paid_to_date\s*=\s*original_amount/);
    expect(liabilityUpdate!.sql).toMatch(/voided_at\s*=\s*COALESCE\(voided_at,\s*now\(\)\)/);
    expect(liabilityUpdate!.sql).toMatch(/void_reason\s*=\s*COALESCE\(void_reason,\s*\$2\)/);
    expect(liabilityUpdate!.sql).toMatch(/voided_by_user_id\s*=\s*COALESCE\(voided_by_user_id,\s*\$3::uuid\)/);
    expect(liabilityUpdate!.values).toEqual([LIABILITY_ID, REASON, ACTOR]);
  });

  it("never touches driver_liabilities when no liabilityId is given (unchanged pre-existing guard)", async () => {
    const client = mockClient();
    await reverseDriverAdvanceInClientTx(client, ACTOR, COMPANY, {
      advanceId: ADVANCE_ID,
      liabilityId: null,
      reason: REASON,
    });
    expect(client.calls.some((c) => c.sql.includes("UPDATE driver_finance.driver_liabilities"))).toBe(false);
  });

  it("COALESCE guards never clobber a voided_at/void_reason/voided_by_user_id an earlier path already set", async () => {
    // The COALESCE itself is the guard — this test just documents the intent so a future edit that
    // drops COALESCE for a bare assignment (silently able to overwrite an earlier, more specific void
    // record) is a visible diff against this test's own assertions above (which pin the COALESCE(...)
    // wrapper for both columns on both tables).
    const client = mockClient();
    await reverseDriverAdvanceInClientTx(client, ACTOR, COMPANY, {
      advanceId: ADVANCE_ID,
      liabilityId: LIABILITY_ID,
      reason: REASON,
    });
    for (const call of client.calls) {
      if (/voided_at\s*=/.test(call.sql)) {
        expect(call.sql).toMatch(/voided_at\s*=\s*COALESCE\(/);
      }
    }
  });
});
