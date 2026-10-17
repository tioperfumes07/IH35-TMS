import { beforeEach, describe, expect, it, vi } from "vitest";

// LEAD 443.192 (11:40Z) — Book Load fills the booked load's deadhead through the ONE engine (fillLoadDeadhead) inside the
// booking transaction, under a SAVEPOINT; a refusal or an engine error never fails the booking and is never silent
// (audited as dispatch.load.deadhead_not_filled with its reason).

const h = vi.hoisted(() => ({ fill: vi.fn(), audit: vi.fn(async () => undefined) }));
vi.mock("../mileage/miles-recommendations.service.js", () => ({ fillLoadDeadhead: h.fill }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: h.audit }));

const { fillDeadheadAtBooking } = await import("../book-load.service.js");

const INPUT = {
  requestingUserUuid: "11111111-1111-4111-8111-111111111111",
  operating_company_id: "5c854333-6ea5-4faa-af31-67cb272fef80",
} as never;
const LOAD = "99999999-9999-4999-8999-999999999999";

function client() {
  const sql: string[] = [];
  return { sql, query: vi.fn(async (q: string) => { sql.push(q); return { rows: [] }; }) };
}

describe("fillDeadheadAtBooking (443.192)", () => {
  beforeEach(() => { h.fill.mockReset(); h.audit.mockClear(); });

  it("calls the one deadhead engine for the booked load on the booking client, inside a savepoint", async () => {
    h.fill.mockResolvedValue({ load_id: LOAD, load_number: "1", status: "filled", miles: 42, method: "google_practical_prev_stop", reason: null });
    const c = client();
    await fillDeadheadAtBooking(c as never, INPUT, LOAD);
    expect(h.fill).toHaveBeenCalledTimes(1);
    expect(h.fill.mock.calls[0]![0]).toBe(c);
    expect(h.fill.mock.calls[0]![1]).toEqual({ operatingCompanyId: "5c854333-6ea5-4faa-af31-67cb272fef80", loadId: LOAD, actorUserId: "11111111-1111-4111-8111-111111111111" });
    expect(c.sql).toEqual(["SAVEPOINT book_load_deadhead", "RELEASE SAVEPOINT book_load_deadhead"]);
    expect(h.audit).not.toHaveBeenCalled(); // the engine audits its own fill (dispatch.load.deadhead_filled)
  });

  it("a typed / document deadhead is left alone (already_set) — nothing audited as a refusal", async () => {
    h.fill.mockResolvedValue({ load_id: LOAD, load_number: "1", status: "already_set", miles: 10, method: null, reason: null });
    await fillDeadheadAtBooking(client() as never, INPUT, LOAD);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("a refusal (not_filled) is audited with the engine's reason and does not throw", async () => {
    h.fill.mockResolvedValue({ load_id: LOAD, load_number: "1", status: "not_filled", miles: null, method: null, reason: "no previous load; the first stop has no real point or time" });
    await expect(fillDeadheadAtBooking(client() as never, INPUT, LOAD)).resolves.toBeUndefined();
    expect(h.audit).toHaveBeenCalledTimes(1);
    const [, actor, event, payload, severity] = h.audit.mock.calls[0] as unknown as [unknown, string, string, Record<string, unknown>, string];
    expect(actor).toBe("11111111-1111-4111-8111-111111111111");
    expect(event).toBe("dispatch.load.deadhead_not_filled");
    expect(payload).toMatchObject({ load_id: LOAD, reason: "no previous load; the first stop has no real point or time", at: "book_load" });
    expect(severity).toBe("warning");
  });

  it("an engine error rolls back only the fill (savepoint), is audited, and never fails the booking", async () => {
    h.fill.mockRejectedValue(new Error("Google routes timeout"));
    const c = client();
    await expect(fillDeadheadAtBooking(c as never, INPUT, LOAD)).resolves.toBeUndefined();
    expect(c.sql).toEqual(["SAVEPOINT book_load_deadhead", "ROLLBACK TO SAVEPOINT book_load_deadhead", "RELEASE SAVEPOINT book_load_deadhead"]);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect((h.audit.mock.calls[0] as unknown as unknown[])[3]).toMatchObject({ reason: "deadhead engine error: Google routes timeout" });
  });
});
