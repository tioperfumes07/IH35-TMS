import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.203 (19:52Z, 5845) — a Relay-fill document whose settlement reference names no live settlement holding its load
 * (the fill was carried to another settlement's load, or the named settlement was cancelled) is restamped, the old reference
 * audited. Before: fillRelayFillExpenseSettlementRef was coalesce-only, so 7 documents on 5845's loads kept cancelled P-0072.
 * The first test FAILS on the old function (no restamp, no audit of the old reference).
 */

const { mockAudit } = vi.hoisted(() => ({ mockAudit: vi.fn(async () => undefined) }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: mockAudit }));

const { fillRelayFillExpenseSettlementRef } = await import("../fuel-expense-document.service.js");

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const EXP = "11111111-1111-4111-8111-111111111111";
const LOAD = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";

/** Emulates the row and Postgres: `held` = references a live settlement holding LOAD carries. */
function fakeClient(row: { settlement_no: string | null; source_settlement_ref: string | null; load_id: string | null }, held: string[]) {
  const doc = { ...row };
  const client = {
    query: vi.fn(async (sql: string, v: unknown[] = []) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [{ ...doc }] };
      if (/AS held/.test(sql)) return { rows: [{ held: held.includes(String(v[1])) && v[2] === LOAD }] };
      if (/UPDATE accounting\.expenses/.test(sql)) {
        const no = String(v[2]);
        const [rNo, rRef] = [v[3] === true, v[4] === true];
        if (!doc.load_id || !(doc.settlement_no === null || doc.source_settlement_ref === null || rNo || rRef)) return { rows: [] };
        doc.settlement_no = rNo ? no : (doc.settlement_no ?? no);
        doc.source_settlement_ref = rRef ? no : (doc.source_settlement_ref ?? no);
        return { rows: [{ id: EXP }] };
      }
      return { rows: [] };
    }),
  };
  return { client, doc };
}

const fill = (client: unknown, no: string, restamp_stale = true) =>
  fillRelayFillExpenseSettlementRef(client as never, { operating_company_id: OPCO, expense_id: EXP, settlement_no: no, actor_user_uuid: ACTOR, restamp_stale });

describe("LEAD 443.203 — a stale Relay-fill settlement reference is restamped", () => {
  it("restamps a reference to a settlement that no longer holds the load (cancelled P-0072 → 5845) and audits the old one", async () => {
    mockAudit.mockClear();
    const { client, doc } = fakeClient({ settlement_no: "P-0072", source_settlement_ref: "P-0072", load_id: LOAD }, ["5845"]);
    expect(await fill(client, "5845")).toBe(true);
    expect(doc).toMatchObject({ settlement_no: "5845", source_settlement_ref: "5845" });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.anything(), ACTOR, "accounting.expense.relay_fill_settlement_ref_restamped",
      expect.objectContaining({ settlement_no: "5845", old_settlement_no: "P-0072", old_source_settlement_ref: "P-0072" }),
      "info", "443.203",
    );
  });

  it("keeps a live reference (fill-once): a settlement that still holds the load is never overwritten", async () => {
    mockAudit.mockClear();
    const { client, doc } = fakeClient({ settlement_no: "5839", source_settlement_ref: "5839", load_id: LOAD }, ["5839", "5845"]);
    expect(await fill(client, "5845")).toBe(false);
    expect(doc).toMatchObject({ settlement_no: "5839", source_settlement_ref: "5839" });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("never restamps without the carrying settlement's say-so (an unprinted fill on a held load is not that settlement's — ruling #3)", async () => {
    mockAudit.mockClear();
    const { client, doc } = fakeClient({ settlement_no: "P-0071", source_settlement_ref: "P-0071", load_id: LOAD }, ["5839"]);
    expect(await fill(client, "5839", false)).toBe(false);
    expect(doc).toMatchObject({ settlement_no: "P-0071", source_settlement_ref: "P-0071" });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("fills an empty reference (audited as a fill) and never writes one on a load-less expense", async () => {
    mockAudit.mockClear();
    const a = fakeClient({ settlement_no: null, source_settlement_ref: null, load_id: LOAD }, ["5845"]);
    expect(await fill(a.client, "5845")).toBe(true);
    expect(a.doc.settlement_no).toBe("5845");
    expect(mockAudit.mock.calls[0]?.[2]).toBe("accounting.expense.relay_fill_settlement_ref_filled");
    const b = fakeClient({ settlement_no: "P-0072", source_settlement_ref: null, load_id: null }, []);
    expect(await fill(b.client, "5845")).toBe(false);
    expect(b.doc.settlement_no).toBe("P-0072");
  });
});
