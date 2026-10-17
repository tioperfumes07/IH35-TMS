/**
 * LEAD 443.192 (owner law): "The signed AlwaysTrack settlement miles are the PC*MILER pay miles = SHORT miles." The Creator
 * seed books the document's miles on miles_shortest; miles_practical comes only from a separate practical figure — never a
 * copy of the pay miles (it used to write the document's miles into miles_practical: settlement-creator-seed-loads.ts:463).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bookLoadOnClient = vi.fn();
vi.mock("../../dispatch/book-load.service.js", () => ({ bookLoadOnClient: (...a: unknown[]) => bookLoadOnClient(...a) }));
vi.mock("../creator-trailer-choice.js", () => ({
  CREATOR_TRAILER_REQUIRED_MESSAGE: "trailer required",
  creatorTrailerChoice: vi.fn(async () => ({ kind: "none" })),
  creatorLoadTrailerEquipmentId: vi.fn(async () => "equipment-type-id"),
}));
vi.mock("../../dispatch/mileage/miles-recommendations.service.js", () => ({ fillLoadDeadhead: vi.fn() }));

const { ensureDispatchedLoadsForCreator } = await import("../settlement-creator-seed-loads.js");
const { creatorPreflightRefusals } = await import("../settlement-creator-preflight.js");
const { creatorLoadMiles, creatorLoadedPayCents, creatorPayMiles } = await import("../settlement-creator-empty-pay.js");
import type { SettlementCreatorDraft, SettlementCreatorLoadBlock } from "../settlement-creator.types.js";

const CO = "00000000-0000-4000-8000-000000000001";
const actor = { uuid: "00000000-0000-4000-8000-000000000004", role: "Owner" };

const loadBlock = (miles: Partial<SettlementCreatorLoadBlock>): SettlementCreatorLoadBlock =>
  ({
    load_number: "MOCK-1",
    factoring: "direct",
    customer_name: "Mock Shipper",
    customer_po_number: "PO-1",
    pickup_date: "2026-10-01",
    pickup_city: "Laredo", pickup_state: "TX", pickup_lat: 27.5, pickup_lng: -99.5,
    delivery_city: "Dallas", delivery_state: "TX", delivery_lat: 32.7, delivery_lng: -96.8,
    not_yet_delivered: true,
    empty_miles: 0,
    line_haul_rate_cents: 45,
    ...miles,
  }) as SettlementCreatorLoadBlock;

const draftWith = (load: SettlementCreatorLoadBlock): SettlementCreatorDraft =>
  ({
    operating_company_id: CO,
    driver_id: "00000000-0000-4000-8000-000000000002",
    trailer_id: null,
    settlement_no: "MOCK",
    loads: [load],
    fuel_purchases: [],
  }) as unknown as SettlementCreatorDraft;

const client = () => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("FROM mdata.customers")) return { rows: [{ id: "00000000-0000-4000-8000-0000000000c1" }] };
    return { rows: [] };
  }),
});

beforeEach(() => {
  bookLoadOnClient.mockReset();
  bookLoadOnClient.mockResolvedValue({ result: { kind: "ok", row: { id: "00000000-0000-4000-8000-0000000000a1" } }, afterCommit: () => {} });
});

describe("443.192 — the Creator books the document's miles as SHORT (pay) miles", () => {
  it("document pay miles -> miles_shortest; the separate practical figure -> miles_practical", async () => {
    await ensureDispatchedLoadsForCreator(client() as never, actor, draftWith(loadBlock({ miles_shortest: 1263.9, loaded_miles: 1300 })));
    expect(bookLoadOnClient).toHaveBeenCalledTimes(1);
    const input = bookLoadOnClient.mock.calls[0]![1] as { miles_shortest: number | null; miles_practical: number | null };
    expect(input.miles_shortest).toBe(1263.9);
    expect(input.miles_practical).toBe(1300);
  });

  it("no short miles: refused before booking — the practical figure is never copied into miles_shortest (pay)", async () => {
    await expect(
      ensureDispatchedLoadsForCreator(client() as never, actor, draftWith(loadBlock({ loaded_miles: 1300, miles_shortest: null }))),
    ).rejects.toMatchObject({ code: "short_miles_required" });
    expect(bookLoadOnClient).not.toHaveBeenCalled();
  });

  it("no practical figure: refused before booking — the short pay miles are never copied into miles_practical", async () => {
    await expect(
      ensureDispatchedLoadsForCreator(client() as never, actor, draftWith(loadBlock({ loaded_miles: null, miles_shortest: 1263.9 }))),
    ).rejects.toMatchObject({ code: "practical_miles_required" });
    expect(bookLoadOnClient).not.toHaveBeenCalled();
  });

  it("the preview names short miles (not practical) when the pay miles are missing", async () => {
    const refusals = await creatorPreflightRefusals(client() as never, draftWith(loadBlock({ loaded_miles: 1300, miles_shortest: null })));
    expect(refusals.some((r) => r.includes("MOCK-1") && r.includes("SHORT (pay) miles are required"))).toBe(true);
    const ok = await creatorPreflightRefusals(client() as never, draftWith(loadBlock({ miles_shortest: 1263.9, loaded_miles: 1300 })));
    expect(ok.some((r) => r.includes("SHORT (pay) miles") || r.includes("E_MILES_PRACTICAL_REQUIRED"))).toBe(false);
  });

  it("creatorPayMiles is SHORT miles only — loaded / practical miles never pay", () => {
    expect(creatorPayMiles({ miles_shortest: 1263.9, loaded_miles: 1300 })).toBe(1263.9);
    expect(creatorPayMiles({ miles_shortest: null, loaded_miles: 1300 })).toBeNull();
    expect(creatorLoadedPayCents({ miles_shortest: null, loaded_miles: 1300, line_haul_rate_cents: 45 })).toBeNull();
    expect(creatorLoadedPayCents({ miles_shortest: 1263.9, loaded_miles: 1300, line_haul_rate_cents: 45 })).toBe(56876);
  });

  it("creatorLoadMiles: short = the figure the earnings line pays; practical = its own figure; never copied", () => {
    expect(creatorLoadMiles({ miles_shortest: 1263.9, loaded_miles: 1300 })).toEqual({ miles_shortest: 1263.9, miles_practical: 1300 });
    expect(creatorLoadMiles({ miles_shortest: null, loaded_miles: 1300 })).toEqual({ miles_shortest: null, miles_practical: 1300 });
    expect(creatorLoadMiles({ miles_shortest: 1263.9, loaded_miles: null })).toEqual({ miles_shortest: 1263.9, miles_practical: null });
    expect(creatorLoadMiles({ miles_shortest: 500, loaded_miles: null, line_haul_miles: 520 }).miles_practical).toBe(520);
  });
});
