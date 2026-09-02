import { describe, expect, it, vi } from "vitest";

import {
  PresettlementLinkError,
  confirmPresettlementLink,
  suggestPresettlementLink,
} from "../presettlement-link.service.js";

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_ID = "11111111-1111-1111-1111-111111111111";
const DRIVER_ID = "22222222-2222-2222-2222-222222222222";
const TOUR_ID = "33333333-3333-3333-3333-333333333333";
const OPEN_SETTLEMENT_ID = "44444444-4444-4444-4444-444444444444";
const SUGGESTION_ID = "55555555-5555-5555-5555-555555555555";
const USER_ID = "66666666-6666-6666-6666-666666666666";

function makeClient(overrides: { openSettlement?: { id: string; display_id: string } | null; suggestionStatus?: string } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      if (/SELECT audit\.append_event/.test(sql)) return { rows: [] };
      if (/SELECT id, display_id\s+FROM driver_finance\.driver_settlements/.test(sql)) {
        return { rows: overrides.openSettlement ? [overrides.openSettlement] : [] };
      }
      if (/SELECT id FROM driver_finance\.presettlement_link_suggestions WHERE/.test(sql)) return { rows: [] };
      if (/INSERT INTO driver_finance\.presettlement_link_suggestions/.test(sql)) return { rows: [{ id: SUGGESTION_ID }] };
      if (/UPDATE driver_finance\.presettlement_link_suggestions/.test(sql)) return { rows: [] };
      if (/SELECT id, load_id::text, driver_id::text, tour_id::text, suggested_settlement_id::text, status/.test(sql)) {
        return {
          rows: [
            {
              id: SUGGESTION_ID,
              load_id: LOAD_ID,
              driver_id: DRIVER_ID,
              tour_id: TOUR_ID,
              suggested_settlement_id: overrides.openSettlement?.id ?? null,
              status: overrides.suggestionStatus ?? "pending",
            },
          ],
        };
      }
      if (/SELECT EXISTS \(SELECT 1 FROM lib\.trace_counters/.test(sql)) return { rows: [{ exists: true }] };
      if (/SELECT lib\.next_trace_no/.test(sql)) return { rows: [{ seq: "1" }] };
      if (/INSERT INTO driver_finance\.driver_settlements/.test(sql)) return { rows: [{ id: "new-settlement-id" }] };
      if (/SELECT id FROM driver_finance\.driver_settlements WHERE id = \$1::uuid/.test(sql)) return { rows: [{ id: OPEN_SETTLEMENT_ID }] };
      if (/UPDATE driver_finance\.driver_settlements/.test(sql)) return { rows: [] };
      if (/UPDATE mdata\.loads SET presettlement_link_id/.test(sql)) return { rows: [] };
      return { rows: [] };
    }),
  };
  return { client, calls };
}

describe("presettlement link — GO-22", () => {
  it("NB always suggests creating a new pre-settlement", async () => {
    const { client } = makeClient();
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "NB",
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBeNull();
    expect(result.suggested_reason).toMatch(/new tour/);
  });

  it("TR/SB with a matching open settlement for the tour suggests linking to it", async () => {
    const { client } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "TR",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBe(OPEN_SETTLEMENT_ID);
    expect(result.suggested_reason).toMatch(/joins the open pre-settlement/);
  });

  it("TR/SB with no open settlement for the tour honestly suggests nothing, not an error", async () => {
    const { client } = makeClient({ openSettlement: null });
    const result = await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "SB",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(result.suggested_settlement_id).toBeNull();
    expect(result.suggested_reason).toMatch(/needs manual attach/);
  });

  it("never touches mdata.loads.presettlement_link_id or driver_finance.driver_settlements during suggest — only confirm does", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    await suggestPresettlementLink(client as never, {
      operating_company_id: OPCO,
      load_id: LOAD_ID,
      driver_id: DRIVER_ID,
      trip_type: "TR",
      tour_id: TOUR_ID,
      actor_user_id: USER_ID,
    });
    expect(calls.some((c) => /UPDATE mdata\.loads/.test(c.sql))).toBe(false);
    expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(false);
  });

  it("confirmPresettlementLink create_new mints a new settlement and links the load", async () => {
    const { client, calls } = makeClient({ openSettlement: { id: OPEN_SETTLEMENT_ID, display_id: "S-1" } });
    const result = await confirmPresettlementLink(client as never, {
      operating_company_id: OPCO,
      suggestion_id: SUGGESTION_ID,
      action: "create_new",
      actor_user_id: USER_ID,
    });
    expect(result.status).toBe("confirmed");
    expect(result.settlement_id).toBe("new-settlement-id");
    expect(calls.some((c) => /INSERT INTO driver_finance\.driver_settlements/.test(c.sql))).toBe(true);
    expect(calls.some((c) => /UPDATE mdata\.loads SET presettlement_link_id/.test(c.sql))).toBe(true);
  });

  it("confirmPresettlementLink link_existing refuses when there is no target settlement at all", async () => {
    const { client } = makeClient({ openSettlement: null });
    await expect(
      confirmPresettlementLink(client as never, {
        operating_company_id: OPCO,
        suggestion_id: SUGGESTION_ID,
        action: "link_existing",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "no_target_settlement" });
  });

  it("confirmPresettlementLink refuses to resolve an already-resolved suggestion", async () => {
    const { client } = makeClient({ suggestionStatus: "confirmed" });
    await expect(
      confirmPresettlementLink(client as never, {
        operating_company_id: OPCO,
        suggestion_id: SUGGESTION_ID,
        action: "reject",
        actor_user_id: USER_ID,
      })
    ).rejects.toMatchObject({ code: "suggestion_already_resolved" });
  });

  it("PresettlementLinkError is a real Error subclass carrying a stable .code", () => {
    const err = new PresettlementLinkError("some_code", "some message");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("some_code");
  });
});
