/**
 * E9 / ENG-64 (LEAD 11-03) — the one fill engine runs on every unresolved fill and never undoes a person's decision.
 * Fail-old: before E9 the rerun compared the truck with the CARD's unit (14 phantom repoints), ignored recorded owner rulings
 * and person-confirmed loads (443.288), and no writer ever ran the engine (598 of 856 live fills unresolved).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  resolve: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("../fill-truck-and-load.service.js", async (orig) => {
  const real = await orig<typeof import("../fill-truck-and-load.service.js")>();
  return { ...real, resolveFillTruckAndLoad: engine.resolve, applyFillTruckAndLoad: engine.apply };
});
const db = vi.hoisted(() => ({ ids: [] as string[], fail: new Set<string>() }));
vi.mock("../../auth/db.js", () => ({
  withLuciaBypass: async (fn: (c: unknown) => Promise<unknown>) => {
    const client = {
      query: async (sql: string) => {
        if (/to_regclass/.test(sql)) return { rows: [{ ok: true }] };
        if (/FROM fuel\.fuel_transactions f/.test(sql)) return { rows: db.ids.map((id) => ({ id })) };
        return { rows: [] };
      },
    };
    return fn(client);
  },
}));

import { rerunAction } from "../fill-truck-and-load.service.js";
import { evaluateFuelAssignment } from "../fuel-assignment-question.service.js";
import { listUnresolvedFills, runFuelFollowsTruckSweep } from "../fuel-follows-truck-sweep.js";

const base = { hasRuling: false, ownerRuled: false, loadConfirmed: false, truckUnitId: "T152", engineLoadId: "L1", toLoadId: "L1", toUnitId: "T152", currentLoadId: "L1", currentUnitId: "T152" };

describe("E9 rerunAction", () => {
  it("a fill already on its GPS truck is kept even though the card names another truck (was a phantom repoint)", () => {
    expect(rerunAction(base)).toBe("keep");
  });
  it("a different load is a repoint", () => {
    expect(rerunAction({ ...base, toLoadId: "L2" })).toBe("repoint");
  });
  it("a different CURRENT unit is a repoint", () => {
    expect(rerunAction({ ...base, currentUnitId: "T175" })).toBe("repoint");
  });
  it("a recorded owner ruling is never re-pointed", () => {
    expect(rerunAction({ ...base, ownerRuled: true, toLoadId: "L2" })).toBe("owner_ruled");
  });
  it("a person-confirmed load (443.288) is never re-pointed", () => {
    expect(rerunAction({ ...base, loadConfirmed: true, toLoadId: "L2" })).toBe("load_confirmed");
  });
  it("a ruling passed in this run wins", () => {
    expect(rerunAction({ ...base, hasRuling: true, ownerRuled: true })).toBe("ruling");
  });
  it("no GPS truck or no load is held", () => {
    expect(rerunAction({ ...base, truckUnitId: null })).toBe("held");
    expect(rerunAction({ ...base, engineLoadId: null })).toBe("held");
  });
});

const certain = {
  id: "f1", truck_unit_id: "T152", engine_load_id: "L2", engine_load_number: "13700", truck_resolution: "gps", load_resolution: "next_load",
  owner_ruled: false, load_confirmed: false, candidates: [],
};

describe("E9 evaluateFuelAssignment", () => {
  beforeEach(() => { engine.resolve.mockReset(); engine.apply.mockReset(); });
  const client = { query: async (sql: string) => (/to_regclass/.test(sql) ? { rows: [{ ok: true }] } : { rows: [] }) };

  it("applies a certain fill", async () => {
    engine.resolve.mockResolvedValue(certain);
    engine.apply.mockResolvedValue("moved");
    const r = await evaluateFuelAssignment(client as never, { companyId: "c", actorUserId: "u", fuelId: "f1" });
    expect(r.certain).toBe(true);
    expect(engine.apply).toHaveBeenCalledTimes(1);
  });
  it("never applies over an owner ruling", async () => {
    engine.resolve.mockResolvedValue({ ...certain, owner_ruled: true });
    const r = await evaluateFuelAssignment(client as never, { companyId: "c", actorUserId: "u", fuelId: "f1" });
    expect("owner_ruled" in r && r.owner_ruled).toBe(true);
    expect(engine.apply).not.toHaveBeenCalled();
  });
  it("never applies over a person-confirmed load", async () => {
    engine.resolve.mockResolvedValue({ ...certain, load_confirmed: true });
    const r = await evaluateFuelAssignment(client as never, { companyId: "c", actorUserId: "u", fuelId: "f1" });
    expect("load_confirmed" in r && r.load_confirmed).toBe(true);
    expect(engine.apply).not.toHaveBeenCalled();
  });
});

describe("E9 runFuelFollowsTruckSweep", () => {
  beforeEach(() => { engine.resolve.mockReset(); engine.apply.mockReset(); });
  it("evaluates every unresolved fill in its own transaction and reports refusals", async () => {
    db.ids = ["a", "b", "c", "d"];
    engine.resolve.mockImplementation(async (_c: unknown, _co: string, id: string) =>
      id === "b" ? { ...certain, id, load_confirmed: true } : { ...certain, id });
    engine.apply.mockImplementation(async (_c: unknown, input: { fuelId: string }) => {
      if (input.fuelId === "d") throw new Error("fuel_receipt_reattribute_refused: period closed");
      return input.fuelId === "a" ? "moved" : "in_place";
    });
    const s = await runFuelFollowsTruckSweep("c", "u");
    expect(s.evaluated).toBe(4);
    expect(s.applied).toEqual({ moved: 1, in_place: 1 });
    expect(s.load_confirmed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.failures[0]).toMatchObject({ fuel_id: "d" });
  });
});

describe("E9 listUnresolvedFills — keyset pages until exhausted (Codex batch74: a LIMIT 2000 list starved the tail)", () => {
  it("visits all 2001 eligible fills and excludes person-confirmed fills in the read", async () => {
    const all = Array.from({ length: 2001 }, (_, i) => ({ id: `f${String(i).padStart(5, "0")}`, at: "2026-09-01 00:00:00+00" }));
    let sawConfirmedExclusion = false;
    const client = {
      query: async (sql: string, values: unknown[]) => {
        if (/e\.load_confirmation = 'confirmed'/.test(sql)) sawConfirmedExclusion = true;
        const [, size, afterAt, afterId] = values as [string, number, string | null, string | null];
        const rest = afterAt == null ? all : all.filter((r) => r.id > String(afterId));
        return { rows: rest.slice(0, size) };
      },
    };
    const ids = await listUnresolvedFills(client as never, "c", 500);
    expect(ids).toHaveLength(2001);
    expect(ids[2000]).toBe("f02000");
    expect(new Set(ids).size).toBe(2001);
    expect(sawConfirmedExclusion).toBe(true);
  });
});
