import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AccidentLiabilityError,
  createLiabilityFromAccident,
  decideAccidentLiability,
  voidAccidentLiability,
} from "../accident-liabilities.service.js";

vi.mock("../../accounting/journal-entries.service.js", () => ({
  createJournalEntryOnClient: vi.fn(async () => ({ id: "je-1" })),
  reverseJournalEntryNoFlip: vi.fn(async () => ({ reversalJeId: "je-rev-1" })),
}));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccount: vi.fn(async () => "ap-account-1"),
}));

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACCIDENT_ID = "11111111-1111-1111-1111-111111111111";
const DRIVER_ID = "22222222-2222-2222-2222-222222222222";
const LIABILITY_ID = "33333333-3333-3333-3333-333333333333";

// Minimal fake client: routes each expected query shape to a canned result. Good enough to drive
// the service's own branching without a live DB — the DB-integration side of this feature is
// covered by the migration's own live apply (db/migrations/202613400001) and the route-level
// wiring is asserted separately below via a static source check.
function makeClient(overrides: { costLineTotal?: number; liabilityRow?: Record<string, unknown> | null; deductionStatus?: string } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT id, assessed_amount_cents, net_exposure_cents\s+FROM safety\.accident_liabilities/.test(sql)) {
        return { rows: [] }; // no existing liability -> create path
      }
      if (/SELECT COALESCE\(SUM\(amount_cents\)/.test(sql)) {
        return { rows: [{ total: String(overrides.costLineTotal ?? 100000) }] };
      }
      if (/INSERT INTO safety\.accident_liabilities/.test(sql)) {
        return { rows: [{ id: LIABILITY_ID }] };
      }
      if (/SELECT id, driver_id, load_id, net_exposure_cents, deductible_cents, expense_account_id, owner_decision, voided_at\s+FROM safety\.accident_liabilities/.test(sql)) {
        if (overrides.liabilityRow === null) return { rows: [] };
        return {
          rows: [
            overrides.liabilityRow ?? {
              id: LIABILITY_ID,
              driver_id: DRIVER_ID,
              load_id: null,
              net_exposure_cents: "100000",
              deductible_cents: "0",
              expense_account_id: "expense-acct-1",
              owner_decision: null,
              voided_at: null,
            },
          ],
        };
      }
      if (/INSERT INTO driver_finance\.driver_settlement_deductions/.test(sql)) {
        return { rows: [{ id: "deduction-1" }] };
      }
      if (/UPDATE safety\.accident_liabilities/.test(sql)) {
        return { rows: [] };
      }
      if (/SELECT id, voided_at, deduction_id, journal_entry_id\s+FROM safety\.accident_liabilities/.test(sql)) {
        return { rows: [{ id: LIABILITY_ID, voided_at: null, deduction_id: "deduction-1", journal_entry_id: "je-1" }] };
      }
      if (/SELECT status FROM driver_finance\.driver_settlement_deductions/.test(sql)) {
        return { rows: [{ status: overrides.deductionStatus ?? "pending" }] };
      }
      if (/UPDATE driver_finance\.driver_settlement_deductions/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
  return { client, calls };
}

describe("accident-liabilities — GO-20 slice C GUARD spec", () => {
  // GUARD bullet 1: "A test that files an accident and asserts a liability with a null decision
  // and zero postings."
  it("filing creates a liability with owner_decision NULL, status open, and posts NOTHING", async () => {
    const { client, calls } = makeClient({ costLineTotal: 250000 });
    const result = await createLiabilityFromAccident(client as never, {
      operating_company_id: OPCO,
      accident_id: ACCIDENT_ID,
      created_by_user_id: DRIVER_ID,
    });
    expect(result.action).toBe("created");
    expect(result.assessed_amount_cents).toBe(250000);
    expect(result.net_exposure_cents).toBe(250000);
    // The INSERT itself carries owner_decision only via the table's own DEFAULT NULL /
    // status DEFAULT 'open' -- prove no code path here writes owner_decision, journal_entry_id, or
    // a deduction: no INSERT into driver_settlement_deductions and no JE creation happened.
    const insertLiability = calls.find((c) => /INSERT INTO safety\.accident_liabilities/.test(c.sql));
    expect(insertLiability).toBeTruthy();
    expect(insertLiability!.sql).not.toMatch(/owner_decision/);
    expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlement_deductions/.test(c.sql))).toBe(false);
    const { createJournalEntryOnClient } = await import("../../accounting/journal-entries.service.js");
    expect(createJournalEntryOnClient).not.toHaveBeenCalled();
  });

  // GUARD bullet 2: "A test that a decision of split refuses unless the two amounts equal the net."
  it("split refuses unless driver_charge_cents + company_absorb_cents equals net_exposure_cents exactly", async () => {
    const { client } = makeClient();
    await expect(
      decideAccidentLiability(client as never, {
        operating_company_id: OPCO,
        liability_id: LIABILITY_ID,
        decision: "split",
        note: "half and half",
        decided_by_user_id: DRIVER_ID,
        driver_charge_cents: 40000, // net is 100000 -> 40000+50000=90000 != 100000
        company_absorb_cents: 50000,
      })
    ).rejects.toMatchObject({ code: "split_amounts_must_equal_net_exposure" });
  });

  it("split succeeds when the two amounts equal net_exposure_cents exactly", async () => {
    const { client } = makeClient();
    const result = await decideAccidentLiability(client as never, {
      operating_company_id: OPCO,
      liability_id: LIABILITY_ID,
      decision: "split",
      note: "half and half",
      decided_by_user_id: DRIVER_ID,
      driver_charge_cents: 40000,
      company_absorb_cents: 60000,
    });
    expect(result.driver_charge_cents).toBe(40000);
    expect(result.company_absorb_cents).toBe(60000);
    expect(result.status).toBe("posted");
  });

  // GUARD bullet 4: "A test that a driver deduction from a liability is created pending, never
  // applied."
  it("driver_chargeback creates a PENDING deduction, never applied, never automatic-and-silent (requires a note)", async () => {
    const { client, calls } = makeClient();
    await expect(
      decideAccidentLiability(client as never, {
        operating_company_id: OPCO,
        liability_id: LIABILITY_ID,
        decision: "driver_chargeback",
        note: "",
        decided_by_user_id: DRIVER_ID,
      })
    ).rejects.toMatchObject({ code: "decision_note_required" });

    const result = await decideAccidentLiability(client as never, {
      operating_company_id: OPCO,
      liability_id: LIABILITY_ID,
      decision: "driver_chargeback",
      note: "driver ran the light",
      decided_by_user_id: DRIVER_ID,
    });
    expect(result.deduction_id).toBe("deduction-1");
    const insertDeduction = calls.find((c) => /INSERT INTO driver_finance\.driver_settlement_deductions/.test(c.sql));
    expect(insertDeduction).toBeTruthy();
    expect(insertDeduction!.sql).toMatch(/'pending'/);
    expect(insertDeduction!.sql).not.toMatch(/'applied'/);
  });

  it("a liability that already has an owner_decision refuses a second decide", async () => {
    const { client } = makeClient({
      liabilityRow: {
        id: LIABILITY_ID,
        driver_id: DRIVER_ID,
        load_id: null,
        net_exposure_cents: "100000",
        deductible_cents: "0",
        expense_account_id: "expense-acct-1",
        owner_decision: "company_absorbs",
        voided_at: null,
      },
    });
    await expect(
      decideAccidentLiability(client as never, {
        operating_company_id: OPCO,
        liability_id: LIABILITY_ID,
        decision: "driver_chargeback",
        note: "re-decide attempt",
        decided_by_user_id: DRIVER_ID,
      })
    ).rejects.toMatchObject({ code: "accident_liability_already_decided" });
  });

  // GUARD bullet 5: "A test that voiding a liability voids its deduction and reverses its entry,
  // and that neither is ever hard deleted."
  it("voiding a liability holds its pending deduction and reverses its journal entry, never deletes either", async () => {
    const { client, calls } = makeClient({ deductionStatus: "pending" });
    const result = await voidAccidentLiability(client as never, {
      operating_company_id: OPCO,
      liability_id: LIABILITY_ID,
      voided_by_user_id: DRIVER_ID,
      reason: "duplicate filing",
    });
    expect(result.voided).toBe(true);
    expect(calls.some((c) => /DELETE FROM/i.test(c.sql))).toBe(false);
    const holdUpdate = calls.find((c) => /UPDATE driver_finance\.driver_settlement_deductions/.test(c.sql));
    expect(holdUpdate).toBeTruthy();
    expect(holdUpdate!.sql).toMatch(/is_held = true/);
    const { reverseJournalEntryNoFlip } = await import("../../accounting/journal-entries.service.js");
    expect(reverseJournalEntryNoFlip).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ operatingCompanyId: OPCO, journalEntryId: "je-1" })
    );
  });

  it("voiding refuses when the deduction has already been applied to a settlement", async () => {
    const { client } = makeClient({ deductionStatus: "applied" });
    await expect(
      voidAccidentLiability(client as never, {
        operating_company_id: OPCO,
        liability_id: LIABILITY_ID,
        voided_by_user_id: DRIVER_ID,
        reason: "duplicate filing",
      })
    ).rejects.toMatchObject({ code: "deduction_already_applied" });
  });
});

// GUARD bullet 3: "A test that a non owner role cannot call decide." — a lightweight static check
// of the route source (matching this repo's own guard convention, e.g.
// scripts/verify-capitalize-threshold-7000.mjs) rather than standing up a full Fastify app: the
// role gate must exist as a hard 403 refusal ahead of any service call, on BOTH /decide and /void.
describe("accident-liabilities routes — owner-only gate (static)", () => {
  it('POST .../decide and .../void both refuse non-Owner roles with 403 BEFORE calling the service', () => {
    const routesFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "accident-liabilities.routes.ts");
    const src = fs.readFileSync(routesFile, "utf8");
    const decideBlock = src.slice(src.indexOf('"/api/v1/safety/accident-liabilities/:id/decide"'), src.indexOf('"/api/v1/safety/accident-liabilities/:id/void"'));
    const voidBlock = src.slice(src.indexOf('"/api/v1/safety/accident-liabilities/:id/void"'));
    for (const block of [decideBlock, voidBlock]) {
      expect(block).toMatch(/user\.role\s*!==\s*"Owner"/);
      expect(block).toMatch(/reply\.code\(403\)/);
      // the 403 return must appear before the call into the service (withCompanyScope), not after
      const roleCheckIdx = block.search(/user\.role\s*!==\s*"Owner"/);
      const serviceCallIdx = block.search(/withCompanyScope\(/);
      expect(roleCheckIdx).toBeGreaterThan(-1);
      expect(serviceCallIdx).toBeGreaterThan(roleCheckIdx);
    }
  });

  it("AccidentLiabilityError is a real Error subclass carrying a stable .code", () => {
    const err = new AccidentLiabilityError("some_code", "some message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some_code");
  });
});
