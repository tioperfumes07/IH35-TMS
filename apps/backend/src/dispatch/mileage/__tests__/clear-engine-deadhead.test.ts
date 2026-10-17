// LEAD 443.195 — clearEngineDeadhead: the mileage engine clears ONLY a deadhead it wrote itself (miles_choice.empty.source
// 'google' + an engine method + unchanged value) to NULL, records source 'document' / value NULL, and audits each clear.
import { describe, expect, it, vi } from "vitest";

const appendCrudAudit = vi.fn();
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: (...a: unknown[]) => appendCrudAudit(...a) }));

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const REASON = "Lead 443.195: engine deadhead not on the signed document";

function db(init: { miles_deadhead: string | null; method: string | null; empty: Record<string, unknown> | null }) {
  const state = { ...init, miles_choice: { short: { source: "document", value: 470 }, ...(init.empty ? { empty: init.empty } : {}) } as Record<string, unknown> };
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/^\s*SELECT load_number, miles_deadhead/.test(sql))
      return { rows: [{ load_number: "13498", miles_deadhead: state.miles_deadhead, method: state.method, empty: (state.miles_choice.empty as Record<string, unknown>) ?? null }] };
    if (/UPDATE mdata\.loads/.test(sql)) {
      const [, , v, json] = values as [string, string, number, string];
      const empty = state.miles_choice.empty as Record<string, unknown> | undefined;
      if (Number(state.miles_deadhead) !== Number(v) || empty?.source !== "google") return { rows: [] };
      state.miles_deadhead = null;
      state.method = null;
      state.miles_choice = { ...state.miles_choice, empty: JSON.parse(json) };
      return { rows: [{ id: LOAD }] };
    }
    throw new Error(`unhandled ${sql.slice(0, 80)}`);
  });
  return { query, state };
}
const engineEmpty = { value: 412.3, source: "google", google: 412.3, historical: null, document_value: null };

describe("clearEngineDeadhead (LEAD 443.195)", () => {
  it("clears an engine-written deadhead to NULL, records source 'document' value NULL, audits it", async () => {
    appendCrudAudit.mockClear();
    const { clearEngineDeadhead } = await import("../miles-recommendations.service.js");
    const d = db({ miles_deadhead: "412.3", method: "google_practical_prev_stop", empty: engineEmpty });
    const r = await clearEngineDeadhead(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR, reason: REASON });
    expect(r).toMatchObject({ status: "cleared", cleared_miles: 412.3, cleared_method: "google_practical_prev_stop" });
    expect(d.state.miles_deadhead).toBeNull();
    expect(d.state.method).toBeNull();
    expect(d.state.miles_choice.empty).toMatchObject({ value: null, source: "document", document_value: null, cleared_engine_value: 412.3, reason: REASON });
    expect(d.state.miles_choice.short).toMatchObject({ value: 470 });
    expect(appendCrudAudit).toHaveBeenCalledTimes(1);
    expect(appendCrudAudit.mock.calls[0][2]).toBe("dispatch.load.miles_deadhead_cleared");
    expect(appendCrudAudit.mock.calls[0][3]).toMatchObject({ load_id: LOAD, old_value: 412.3, old_method: "google_practical_prev_stop", new_value: null, new_source: "document" });
  });

  it("refuses a document / manual deadhead, a non-engine method, a changed value, and no deadhead — nothing written", async () => {
    appendCrudAudit.mockClear();
    const { clearEngineDeadhead } = await import("../miles-recommendations.service.js");
    const cases = [
      db({ miles_deadhead: "55.0", method: null, empty: { value: 55, source: "document" } }),
      db({ miles_deadhead: "55.0", method: "manual", empty: { value: 55, source: "manual" } }),
      db({ miles_deadhead: "412.3", method: "manual", empty: engineEmpty }),
      db({ miles_deadhead: "400.0", method: "google_practical_prev_stop", empty: engineEmpty }),
      db({ miles_deadhead: null, method: null, empty: null }),
    ];
    for (const d of cases) {
      const before = JSON.stringify(d.state);
      const r = await clearEngineDeadhead(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR, reason: REASON });
      expect(r.status).toBe("refused");
      expect(JSON.stringify(d.state)).toBe(before);
    }
    expect(appendCrudAudit).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    const { clearEngineDeadhead } = await import("../miles-recommendations.service.js");
    const d = db({ miles_deadhead: "412.3", method: "google_practical_prev_stop", empty: engineEmpty });
    await expect(clearEngineDeadhead(d as never, { operatingCompanyId: CO, loadId: LOAD, actorUserId: ACTOR, reason: " " })).rejects.toThrow("deadhead_clear_requires_reason");
  });
});
