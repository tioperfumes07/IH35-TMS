import { describe, expect, it } from "vitest";
import { correctFuelTransactionDate } from "../fuel-transaction-date-correction.service.js";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FUEL = "40ea84c2-ef43-49d9-ab0f-8f52b3209e5c";
const base = { day: "2026-09-29", voided: false, archived: false, live_docs: 0, live_legs: 0, live_bank: 0 };

function fakeClient(row: Partial<typeof base> | null) {
  const sql: string[] = [];
  return {
    sql,
    async query(text: string) {
      sql.push(text);
      if (/FOR UPDATE OF ft/.test(text)) return { rows: row ? [{ ...base, ...row }] : [] };
      return { rows: [] };
    },
  };
}
const input = { operatingCompanyId: CO, fuelTransactionId: FUEL, trueDate: "2026-08-29", reason: "month misprinted", evidence: "PDF line quoted", actorUserId: CO };

describe("correctFuelTransactionDate", () => {
  it("moves the source date and audits it when nothing hangs on the row", async () => {
    const c = fakeClient({});
    expect(await correctFuelTransactionDate(c, input)).toEqual({ outcome: "corrected", from: "2026-09-29", to: "2026-08-29" });
    expect(c.sql.some((s) => /UPDATE fuel\.fuel_transactions/.test(s))).toBe(true);
    expect(c.sql.some((s) => /INSERT INTO audit|audit/i.test(s))).toBe(true);
  });
  it.each([
    ["a live expense document", { live_docs: 1 }, /live expense document/],
    ["live fuel_event postings", { live_legs: 2 }, /fuel_event/],
    ["a bank match", { live_bank: 1 }, /bank line/],
    ["a voided row", { voided: true }, /voided or archived/],
    ["an archived row", { archived: true }, /voided or archived/],
    ["the same date", { day: "2026-08-29" }, /already dated/],
  ])("refuses %s and writes nothing", async (_n, row, why) => {
    const c = fakeClient(row);
    const out = await correctFuelTransactionDate(c, input);
    expect(out.outcome).toBe("refused");
    expect((out as { reason: string }).reason).toMatch(why);
    expect(c.sql.some((s) => /UPDATE fuel\.fuel_transactions/.test(s))).toBe(false);
  });
  it("refuses a missing row, a fake calendar date and a missing reason or evidence", async () => {
    expect((await correctFuelTransactionDate(fakeClient(null), input)).outcome).toBe("refused");
    expect((await correctFuelTransactionDate(fakeClient({}), { ...input, trueDate: "2026-02-30" })).outcome).toBe("refused");
    expect((await correctFuelTransactionDate(fakeClient({}), { ...input, evidence: " " })).outcome).toBe("refused");
    expect((await correctFuelTransactionDate(fakeClient({}), { ...input, reason: "" })).outcome).toBe("refused");
  });
});
