import { describe, expect, it, vi } from "vitest";
import { creatorPreflightRefusals } from "../settlement-creator-preflight.js";
import { ensureDispatchedLoadsForCreator } from "../settlement-creator-seed-loads.js";
import type { SettlementCreatorDraft } from "../settlement-creator.types.js";

const draft = {
  operating_company_id: "00000000-0000-4000-8000-000000000001",
  driver_id: "00000000-0000-4000-8000-000000000002",
  trailer_id: "00000000-0000-4000-8000-000000000003",
  settlement_no: "MOCK", loads: [{ load_number: "MOCK-LOAD" }], fuel_purchases: [],
} as SettlementCreatorDraft;
const actor = { uuid: "00000000-0000-4000-8000-000000000004", role: "Owner" };

describe("G2 preview and booking share trailer type refusal", () => {
  it("preview names unresolved trailer type", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const errors = await creatorPreflightRefusals({ query }, draft);
    expect(errors.some(e => e.includes("MOCK-LOAD") && e.includes("no supported equipment type"))).toBe(true);
  });
  it("new-load post refuses before booking or any INSERT", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(ensureDispatchedLoadsForCreator({ query } as never, actor, draft))
      .rejects.toMatchObject({ code: "trailer_equipment_type_required" });
    expect(query.mock.calls.some(([sql]) => /\bINSERT\b/i.test(String(sql)))).toBe(false);
  });
  it("all-adopted Edit keeps historical load without today's equipment lookup", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM mdata.equipment") || sql.includes("FROM catalogs.load_trailer_equipment")) throw new Error("unexpected type lookup");
      if (sql.includes("FROM mdata.loads")) return { rows: [{ id: "existing-load", load_number: "MOCK-LOAD" }] };
      if (sql.includes("FROM driver_finance.driver_settlements")) return { rows: [{ ok: true }] };
      return { rows: [] };
    });
    const edit = { ...draft, edit_void_repost: true };
    expect(await ensureDispatchedLoadsForCreator({ query } as never, actor, edit)).toEqual({ created_load_numbers: [], afterCommit: [], stop_stamps: [] });
    expect((await creatorPreflightRefusals({ query } as never, edit)).some(e => e.includes("equipment type"))).toBe(false);
  });
  it("preview propagates database failures rather than returning an empty refusal list", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("FROM mdata.equipment")) throw new Error("database unavailable");
      return { rows: [] };
    });
    await expect(creatorPreflightRefusals({ query } as never, draft)).rejects.toThrow("database unavailable");
  });
});
